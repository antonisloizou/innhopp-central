package comms

import (
	"encoding/base64"
	"fmt"
	"html"
	"regexp"
	"strings"
	"time"
)

type EmailAttachment struct {
	ContentID   string
	ContentType string
	Data        []byte
	Filename    string
}

var inlineDataImageRegex = regexp.MustCompile(`(?is)<img\b[^>]*\bsrc=(?:"(data:image/([a-zA-Z0-9.+-]+);base64,([^"<>]+))"|'(data:image/([a-zA-Z0-9.+-]+);base64,([^'<>]+))')[^>]*>`)

func prepareEmailContent(body string) (string, string, []EmailAttachment) {
	htmlBody := normalizeEmailHTML(body)
	attachments := make([]EmailAttachment, 0)
	imageIndex := 0

	htmlBody = inlineDataImageRegex.ReplaceAllStringFunc(htmlBody, func(match string) string {
		parts := inlineDataImageRegex.FindStringSubmatch(match)
		if len(parts) < 7 {
			return match
		}

		dataURL := strings.TrimSpace(parts[1])
		contentSubtype := strings.TrimSpace(parts[2])
		dataBase64 := strings.TrimSpace(parts[3])
		if dataURL == "" {
			dataURL = strings.TrimSpace(parts[4])
			contentSubtype = strings.TrimSpace(parts[5])
			dataBase64 = strings.TrimSpace(parts[6])
		}
		if dataURL == "" || contentSubtype == "" || dataBase64 == "" {
			return match
		}

		contentType := "image/" + strings.ToLower(contentSubtype)
		data, err := base64.StdEncoding.DecodeString(dataBase64)
		if err != nil || len(data) == 0 {
			return match
		}

		imageIndex++
		contentID := fmt.Sprintf("inline-image-%d-%d", time.Now().UTC().UnixNano(), imageIndex)
		filename := fmt.Sprintf("inline-image-%d.%s", imageIndex, imageExtensionFromContentType(contentType))
		attachments = append(attachments, EmailAttachment{
			ContentID:   contentID,
			ContentType: contentType,
			Data:        data,
			Filename:    filename,
		})

		return strings.Replace(match, dataURL, "cid:"+contentID, 1)
	})

	return htmlBody, htmlToPlainText(htmlBody), attachments
}

func normalizeEmailHTML(body string) string {
	trimmed := strings.TrimSpace(strings.ReplaceAll(body, "\r\n", "\n"))
	if trimmed == "" {
		return ""
	}
	trimmed = strings.ReplaceAll(trimmed, "\r", "\n")
	trimmed = strings.ReplaceAll(trimmed, "\n", "<br />\n")
	if strings.Contains(strings.ToLower(trimmed), "<html") {
		return trimmed
	}
	return "<html><body>" + trimmed + "</body></html>"
}

func htmlToPlainText(value string) string {
	replacer := strings.NewReplacer(
		"<br>", "\n",
		"<br/>", "\n",
		"<br />", "\n",
		"</p>", "\n\n",
		"</div>", "\n",
		"</li>", "\n",
		"</tr>", "\n",
		"</h1>", "\n\n",
		"</h2>", "\n\n",
		"</h3>", "\n\n",
	)
	text := replacer.Replace(value)
	text = regexp.MustCompile(`(?is)<[^>]+>`).ReplaceAllString(text, "")
	text = html.UnescapeString(text)
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRight(line, " \t")
	}
	text = strings.Join(lines, "\n")
	text = regexp.MustCompile(`\n{3,}`).ReplaceAllString(text, "\n\n")
	return strings.TrimSpace(text)
}

func imageExtensionFromContentType(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/jpeg", "image/jpg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/gif":
		return "gif"
	case "image/webp":
		return "webp"
	case "image/svg+xml":
		return "svg"
	default:
		return "img"
	}
}
