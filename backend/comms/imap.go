package comms

import (
	"bufio"
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type SentMessageStore interface {
	AppendSent(ctx context.Context, raw []byte) error
}

type IMAPConfig struct {
	Host       string
	Port       string
	Username   string
	Password   string
	SentFolder string
}

func (c IMAPConfig) Normalized() IMAPConfig {
	cfg := c
	cfg.Host = strings.TrimSpace(cfg.Host)
	cfg.Port = strings.TrimSpace(cfg.Port)
	if cfg.Port == "" {
		cfg.Port = "993"
	}
	cfg.Username = strings.TrimSpace(cfg.Username)
	cfg.Password = strings.TrimSpace(cfg.Password)
	cfg.SentFolder = strings.TrimSpace(cfg.SentFolder)
	return cfg
}

func (c IMAPConfig) Validate() error {
	cfg := c.Normalized()
	switch {
	case cfg.Host == "":
		return fmt.Errorf("IMAP_HOST is required")
	case cfg.Username == "":
		return fmt.Errorf("IMAP_USERNAME is required")
	case cfg.Password == "":
		return fmt.Errorf("IMAP_PASSWORD is required")
	default:
		return nil
	}
}

type IMAPSentStore struct {
	config IMAPConfig
}

func NewIMAPSentStore(config IMAPConfig) (*IMAPSentStore, error) {
	cfg := config.Normalized()
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &IMAPSentStore{config: cfg}, nil
}

func (s *IMAPSentStore) AppendSent(ctx context.Context, raw []byte) error {
	if len(raw) == 0 {
		return fmt.Errorf("raw message is empty")
	}

	addr := net.JoinHostPort(s.config.Host, s.config.Port)
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{
		ServerName: s.config.Host,
		MinVersion: tls.VersionTLS12,
	})
	if err != nil {
		return err
	}
	defer conn.Close()

	client := newIMAPClient(conn)
	if err := client.expectGreeting(); err != nil {
		return err
	}
	if err := client.login(s.config.Username, s.config.Password); err != nil {
		return err
	}

	mailbox := s.config.SentFolder
	if mailbox == "" {
		mailbox, err = client.findSentMailbox()
		if err != nil {
			return err
		}
	}
	if err := client.append(mailbox, raw); err != nil {
		return err
	}
	return client.logout()
}

type SentFolderCopyingSender struct {
	sender EmailSender
	store  SentMessageStore
	logf   func(string, ...any)
}

func NewSentFolderCopyingSender(sender EmailSender, store SentMessageStore, logf func(string, ...any)) *SentFolderCopyingSender {
	return &SentFolderCopyingSender{
		sender: sender,
		store:  store,
		logf:   logf,
	}
}

func (s *SentFolderCopyingSender) Send(ctx context.Context, message EmailMessage) (EmailSendResult, error) {
	result, err := s.sender.Send(ctx, message)
	if err != nil {
		return EmailSendResult{}, err
	}
	if s.store != nil && len(result.Raw) > 0 {
		if err := s.store.AppendSent(ctx, result.Raw); err != nil && s.logf != nil {
			s.logf("sent-folder append failed for %s: %v", message.To, err)
		}
	}
	return result, nil
}

type imapClient struct {
	conn   net.Conn
	reader *bufio.Reader
	tagID  int
}

func newIMAPClient(conn net.Conn) *imapClient {
	return &imapClient{
		conn:   conn,
		reader: bufio.NewReader(conn),
		tagID:  0,
	}
}

func (c *imapClient) expectGreeting() error {
	line, err := c.readLine()
	if err != nil {
		return err
	}
	if !strings.HasPrefix(strings.ToUpper(line), "* OK") {
		return fmt.Errorf("imap greeting failed: %s", line)
	}
	return nil
}

func (c *imapClient) login(username, password string) error {
	_, _, err := c.command(`LOGIN %s %s`, quoteIMAPString(username), quoteIMAPString(password))
	return err
}

func (c *imapClient) logout() error {
	_, _, err := c.command("LOGOUT")
	return err
}

func (c *imapClient) findSentMailbox() (string, error) {
	lines, _, err := c.command(`LIST "" "*"`)
	if err != nil {
		return "", err
	}

	type mailboxInfo struct {
		name  string
		flags string
	}
	mailboxes := make([]mailboxInfo, 0)
	for _, line := range lines {
		if !strings.HasPrefix(line, "* LIST ") {
			continue
		}
		name := parseIMAPListMailbox(line)
		if name == "" {
			continue
		}
		mailboxes = append(mailboxes, mailboxInfo{name: name, flags: strings.ToUpper(line)})
	}

	for _, mailbox := range mailboxes {
		if strings.Contains(mailbox.flags, `\SENT`) {
			return mailbox.name, nil
		}
	}

	for _, candidate := range []string{"Sent Items", "Sent Messages", "Sent", "INBOX.Sent"} {
		for _, mailbox := range mailboxes {
			if strings.EqualFold(mailbox.name, candidate) {
				return mailbox.name, nil
			}
		}
	}

	return "", fmt.Errorf("could not determine sent mailbox")
}

func (c *imapClient) append(mailbox string, raw []byte) error {
	tag := c.nextTag()
	command := fmt.Sprintf(`%s APPEND %s (\Seen) {%d}`+"\r\n", tag, quoteIMAPString(mailbox), len(raw))
	if _, err := c.conn.Write([]byte(command)); err != nil {
		return err
	}
	line, err := c.readLine()
	if err != nil {
		return err
	}
	if !strings.HasPrefix(line, "+") {
		return fmt.Errorf("imap append rejected: %s", line)
	}
	if _, err := c.conn.Write(raw); err != nil {
		return err
	}
	if _, err := c.conn.Write([]byte("\r\n")); err != nil {
		return err
	}
	return c.expectTaggedOK(tag)
}

func (c *imapClient) command(format string, args ...any) ([]string, string, error) {
	tag := c.nextTag()
	command := fmt.Sprintf(format, args...)
	if _, err := c.conn.Write([]byte(tag + " " + command + "\r\n")); err != nil {
		return nil, "", err
	}

	lines := make([]string, 0)
	for {
		line, err := c.readLine()
		if err != nil {
			return nil, "", err
		}
		if strings.HasPrefix(line, tag+" ") {
			upper := strings.ToUpper(line)
			if strings.Contains(upper, " OK") {
				return lines, line, nil
			}
			return lines, line, fmt.Errorf("imap command failed: %s", line)
		}
		lines = append(lines, line)
	}
}

func (c *imapClient) expectTaggedOK(tag string) error {
	for {
		line, err := c.readLine()
		if err != nil {
			return err
		}
		if strings.HasPrefix(line, tag+" ") {
			upper := strings.ToUpper(line)
			if strings.Contains(upper, " OK") {
				return nil
			}
			return fmt.Errorf("imap command failed: %s", line)
		}
	}
}

func (c *imapClient) readLine() (string, error) {
	line, err := c.reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

func (c *imapClient) nextTag() string {
	c.tagID++
	return "A" + strconv.Itoa(c.tagID)
}

var imapQuotedMailboxRegex = regexp.MustCompile(`"((?:[^"\\]|\\.)*)"\s*$`)
var imapAtomMailboxRegex = regexp.MustCompile(` ([^ ]+)$`)

func parseIMAPListMailbox(line string) string {
	if matches := imapQuotedMailboxRegex.FindStringSubmatch(line); len(matches) == 2 {
		return strings.ReplaceAll(matches[1], `\"`, `"`)
	}
	if matches := imapAtomMailboxRegex.FindStringSubmatch(line); len(matches) == 2 {
		return strings.TrimSpace(matches[1])
	}
	return ""
}

func quoteIMAPString(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	return `"` + value + `"`
}
