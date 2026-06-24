package comms

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"mime"
	"net"
	"net/textproto"
	"strings"
	"time"
)

type EmailSender interface {
	Send(ctx context.Context, message EmailMessage) (EmailSendResult, error)
}

type EmailMessage struct {
	To                string
	Subject           string
	HTML              string
	PlainText         string
	InlineAttachments []EmailAttachment
}

type EmailSendResult struct {
	MessageID string
	Raw       []byte
}

type SMTPConfig struct {
	Host      string
	Port      string
	Username  string
	Password  string
	FromEmail string
	FromName  string
	Security  string
}

func (c SMTPConfig) Normalized() SMTPConfig {
	cfg := c
	cfg.Host = strings.TrimSpace(cfg.Host)
	cfg.Port = strings.TrimSpace(cfg.Port)
	if cfg.Port == "" {
		cfg.Port = "465"
	}
	cfg.Username = strings.TrimSpace(cfg.Username)
	cfg.Password = strings.TrimSpace(cfg.Password)
	cfg.FromEmail = strings.TrimSpace(cfg.FromEmail)
	cfg.FromName = strings.TrimSpace(cfg.FromName)
	cfg.Security = strings.ToLower(strings.TrimSpace(cfg.Security))
	if cfg.Security == "" {
		cfg.Security = "tls"
	}
	return cfg
}

func (c SMTPConfig) Validate() error {
	cfg := c.Normalized()
	switch {
	case cfg.Host == "":
		return fmt.Errorf("SMTP_HOST is required")
	case cfg.Username == "":
		return fmt.Errorf("SMTP_USERNAME is required")
	case cfg.Password == "":
		return fmt.Errorf("SMTP_PASSWORD is required")
	case cfg.FromEmail == "":
		return fmt.Errorf("SMTP_FROM_EMAIL is required")
	}
	switch cfg.Security {
	case "starttls", "tls", "none":
		return nil
	default:
		return fmt.Errorf("SMTP_SECURITY must be one of starttls, tls, none")
	}
}

type SMTPSender struct {
	config SMTPConfig
}

func NewSMTPSender(config SMTPConfig) (*SMTPSender, error) {
	cfg := config.Normalized()
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &SMTPSender{config: cfg}, nil
}

func (s *SMTPSender) Config() SMTPConfig {
	return s.config
}

func (s *SMTPSender) Send(ctx context.Context, message EmailMessage) (EmailSendResult, error) {
	to := strings.TrimSpace(message.To)
	if to == "" {
		return EmailSendResult{}, fmt.Errorf("recipient email is required")
	}

	addr := net.JoinHostPort(s.config.Host, s.config.Port)
	conn, err := s.dial(ctx, addr)
	if err != nil {
		return EmailSendResult{}, err
	}
	defer conn.Close()

	client := newSMTPClient(conn)
	if err := client.expect(220); err != nil {
		return EmailSendResult{}, err
	}
	if err := client.ehlo("localhost"); err != nil {
		return EmailSendResult{}, err
	}
	if s.config.Security == "starttls" {
		if err := client.startTLS(s.config.Host); err != nil {
			return EmailSendResult{}, err
		}
		if err := client.ehlo("localhost"); err != nil {
			return EmailSendResult{}, err
		}
	}
	if err := client.authPlain(s.config.Username, s.config.Password); err != nil {
		return EmailSendResult{}, err
	}

	messageID := buildMessageID(s.config.Host)
	raw := buildMIMEMessage(s.config, message, messageID)
	if err := client.mail(s.config.FromEmail); err != nil {
		return EmailSendResult{}, err
	}
	if err := client.rcpt(to); err != nil {
		return EmailSendResult{}, err
	}
	if err := client.data(raw); err != nil {
		return EmailSendResult{}, err
	}
	if err := client.quit(); err != nil {
		return EmailSendResult{}, err
	}
	return EmailSendResult{
		MessageID: messageID,
		Raw:       raw,
	}, nil
}

func (s *SMTPSender) dial(ctx context.Context, addr string) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	if s.config.Security == "tls" {
		return tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{
			ServerName: s.config.Host,
			MinVersion: tls.VersionTLS12,
		})
	}
	return dialer.DialContext(ctx, "tcp", addr)
}

type smtpClient struct {
	conn net.Conn
	text *textproto.Conn
}

func newSMTPClient(conn net.Conn) *smtpClient {
	return &smtpClient{
		conn: conn,
		text: textproto.NewConn(conn),
	}
}

func (c *smtpClient) expect(code int) error {
	respCode, msg, err := c.text.ReadResponse(code)
	if err != nil {
		if msg != "" {
			return fmt.Errorf("smtp %d: %s", respCode, strings.TrimSpace(msg))
		}
		return err
	}
	return nil
}

func (c *smtpClient) command(expectCode int, format string, args ...any) error {
	if err := c.text.PrintfLine(format, args...); err != nil {
		return err
	}
	return c.expect(expectCode)
}

func (c *smtpClient) ehlo(domain string) error {
	return c.command(250, "EHLO %s", sanitizeSMTPValue(domain))
}

func (c *smtpClient) startTLS(serverName string) error {
	if err := c.command(220, "STARTTLS"); err != nil {
		return err
	}
	tlsConn := tls.Client(c.conn, &tls.Config{
		ServerName: serverName,
		MinVersion: tls.VersionTLS12,
	})
	if err := tlsConn.Handshake(); err != nil {
		return err
	}
	c.conn = tlsConn
	c.text = textproto.NewConn(tlsConn)
	return nil
}

func (c *smtpClient) authPlain(username, password string) error {
	token := base64.StdEncoding.EncodeToString([]byte("\x00" + username + "\x00" + password))
	return c.command(235, "AUTH PLAIN %s", token)
}

func (c *smtpClient) mail(from string) error {
	return c.command(250, "MAIL FROM:<%s>", sanitizeSMTPValue(from))
}

func (c *smtpClient) rcpt(to string) error {
	return c.command(250, "RCPT TO:<%s>", sanitizeSMTPValue(to))
}

func (c *smtpClient) data(raw []byte) error {
	if err := c.command(354, "DATA"); err != nil {
		return err
	}
	writer := c.text.DotWriter()
	if _, err := writer.Write(raw); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return c.expect(250)
}

func (c *smtpClient) quit() error {
	return c.command(221, "QUIT")
}

func buildMIMEMessage(config SMTPConfig, message EmailMessage, messageID string) []byte {
	from := config.FromEmail
	if config.FromName != "" {
		from = mime.QEncoding.Encode("utf-8", config.FromName) + " <" + config.FromEmail + ">"
	}

	plainText := strings.TrimSpace(message.PlainText)
	if plainText == "" {
		plainText = strings.TrimSpace(message.Subject)
	}
	htmlBody := strings.TrimSpace(message.HTML)
	alternativeBoundary := buildBoundary("alt")

	headers := []string{
		"From: " + from,
		"To: " + sanitizeHeaderValue(message.To),
		"Subject: " + mime.QEncoding.Encode("utf-8", strings.TrimSpace(message.Subject)),
		"Message-ID: <" + messageID + ">",
		"MIME-Version: 1.0",
	}

	var builder strings.Builder
	if len(message.InlineAttachments) > 0 {
		relatedBoundary := buildBoundary("related")
		headers = append(headers, `Content-Type: multipart/related; boundary="`+relatedBoundary+`"`)
		for _, header := range headers {
			builder.WriteString(header)
			builder.WriteString("\r\n")
		}
		builder.WriteString("\r\n")

		builder.WriteString("--")
		builder.WriteString(relatedBoundary)
		builder.WriteString("\r\n")
		builder.WriteString(`Content-Type: multipart/alternative; boundary="`)
		builder.WriteString(alternativeBoundary)
		builder.WriteString(`"` + "\r\n\r\n")
		writeAlternativeParts(&builder, alternativeBoundary, plainText, htmlBody)

		for _, attachment := range message.InlineAttachments {
			builder.WriteString("--")
			builder.WriteString(relatedBoundary)
			builder.WriteString("\r\n")
			builder.WriteString("Content-Type: ")
			builder.WriteString(attachment.ContentType)
			builder.WriteString(`; name="`)
			builder.WriteString(sanitizeHeaderValue(attachment.Filename))
			builder.WriteString(`"` + "\r\n")
			builder.WriteString("Content-Transfer-Encoding: base64\r\n")
			builder.WriteString("Content-ID: <")
			builder.WriteString(sanitizeHeaderValue(attachment.ContentID))
			builder.WriteString(">\r\n")
			builder.WriteString(`Content-Disposition: inline; filename="`)
			builder.WriteString(sanitizeHeaderValue(attachment.Filename))
			builder.WriteString(`"` + "\r\n\r\n")
			builder.WriteString(wrapBase64(base64.StdEncoding.EncodeToString(attachment.Data)))
			builder.WriteString("\r\n")
		}

		builder.WriteString("--")
		builder.WriteString(relatedBoundary)
		builder.WriteString("--\r\n")
		return []byte(builder.String())
	}

	headers = append(headers, `Content-Type: multipart/alternative; boundary="`+alternativeBoundary+`"`)
	for _, header := range headers {
		builder.WriteString(header)
		builder.WriteString("\r\n")
	}
	builder.WriteString("\r\n")
	writeAlternativeParts(&builder, alternativeBoundary, plainText, htmlBody)
	return []byte(builder.String())
}

func writeAlternativeParts(builder *strings.Builder, boundary string, plainText string, htmlBody string) {
	builder.WriteString("--")
	builder.WriteString(boundary)
	builder.WriteString("\r\n")
	builder.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	builder.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
	builder.WriteString(strings.ReplaceAll(plainText, "\n", "\r\n"))
	builder.WriteString("\r\n")

	builder.WriteString("--")
	builder.WriteString(boundary)
	builder.WriteString("\r\n")
	builder.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	builder.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
	builder.WriteString(strings.ReplaceAll(htmlBody, "\n", "\r\n"))
	builder.WriteString("\r\n")

	builder.WriteString("--")
	builder.WriteString(boundary)
	builder.WriteString("--\r\n")
}

func buildMessageID(host string) string {
	suffix := strings.TrimSpace(host)
	if suffix == "" {
		suffix = "localhost"
	}
	now := time.Now().UTC()
	return fmt.Sprintf("%d.%d@%s", now.UnixNano(), now.Nanosecond(), suffix)
}

func sanitizeSMTPValue(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, "\r", "")
	value = strings.ReplaceAll(value, "\n", "")
	return value
}

func sanitizeHeaderValue(value string) string {
	return sanitizeSMTPValue(value)
}

func buildBoundary(prefix string) string {
	now := time.Now().UTC()
	return fmt.Sprintf("%s_%d_%d", prefix, now.UnixNano(), now.Nanosecond())
}

func wrapBase64(value string) string {
	if value == "" {
		return ""
	}
	var builder strings.Builder
	for len(value) > 76 {
		builder.WriteString(value[:76])
		builder.WriteString("\r\n")
		value = value[76:]
	}
	builder.WriteString(value)
	builder.WriteString("\r\n")
	return builder.String()
}
