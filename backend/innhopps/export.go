package innhopps

import (
	"archive/zip"
	"bytes"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/innhopp/central/backend/httpx"
)

//go:embed assets/innhopp-project-logo.png
var innhoppProjectLogo []byte

// exportInnhopp creates the operational briefing document used by jump teams.
// The browser supplies satellite-map PNGs rendered by the configured Maps JavaScript API.
func (h *Handler) exportInnhopp(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "innhoppID"), 10, 64)
	if err != nil || id < 1 {
		httpx.Error(w, http.StatusBadRequest, "invalid innhopp id")
		return
	}
	var request exportRequest
	if err := httpx.DecodeJSON(r, &request); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid export maps")
		return
	}
	near, err := decodeExportMap(request.LocalMap)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "the 500 m satellite map could not be read")
		return
	}
	wide, err := decodeExportMap(request.AreaMap)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "the 2 NM satellite map could not be read")
		return
	}

	row := h.db.QueryRow(r.Context(), `SELECT id, event_id, sequence, name, aircraft_id, coordinates, takeoff_airfield_id, landing_airfield_id, elevation, scheduled_at, notes,
                reason_for_choice, adjust_altimeter_aad, notam, distance_by_air, distance_by_road, landing_distance_by_air, landing_distance_by_road, single_load_only,
                primary_landing_area_name, primary_landing_area_description, primary_landing_area_size, primary_landing_area_obstacles,
                secondary_landing_area_name, secondary_landing_area_description, secondary_landing_area_size, secondary_landing_area_obstacles,
                risk_assessment, safety_precautions, jumprun, hospital, rescue_boat, minimum_requirements, image_files, land_owners, land_owner_permission, created_at
         FROM event_innhopps WHERE id = $1`, id)
	innhopp, err := scanInnhopp(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			httpx.Error(w, http.StatusNotFound, "innhopp not found")
		} else {
			httpx.Error(w, http.StatusInternalServerError, "failed to load innhopp")
		}
		return
	}

	var takeoffName, landingName sql.NullString
	var takeoffElevation sql.NullInt64
	err = h.db.QueryRow(r.Context(), `SELECT
		(SELECT name FROM airfields WHERE id = i.takeoff_airfield_id),
		(SELECT name FROM airfields WHERE id = i.landing_airfield_id),
		(SELECT elevation FROM airfields WHERE id = i.takeoff_airfield_id)
		FROM event_innhopps i WHERE i.id = $1`, id).Scan(&takeoffName, &landingName, &takeoffElevation)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load export context")
		return
	}

	docx, err := buildExportDocx(innhopp, takeoffName.String, landingName.String, optionalInt(takeoffElevation), near, wide)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create export document")
		return
	}
	fileName := exportFilename(fmt.Sprintf("%02d-%s.docx", innhopp.Sequence, innhopp.Name))
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	w.Header().Set("Content-Length", strconv.Itoa(len(docx)))
	_, _ = w.Write(docx)
}

func optionalInt(v sql.NullInt64) *int {
	if !v.Valid {
		return nil
	}
	result := int(v.Int64)
	return &result
}

type exportRequest struct {
	LocalMap string `json:"local_map"`
	AreaMap  string `json:"area_map"`
}

func decodeExportMap(value string) ([]byte, error) {
	const prefix = "data:image/png;base64,"
	if !strings.HasPrefix(value, prefix) {
		return nil, fmt.Errorf("expected a PNG data URL")
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, prefix))
	if err != nil || len(data) == 0 || len(data) > 12<<20 {
		return nil, fmt.Errorf("invalid map image")
	}
	if _, format, err := image.DecodeConfig(bytes.NewReader(data)); err != nil || format != "png" {
		return nil, fmt.Errorf("invalid map PNG")
	}
	return data, nil
}

func exportFilename(name string) string {
	name = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			return r
		}
		return '-'
	}, name)
	return strings.Trim(strings.TrimSuffix(name, ".docx"), "-") + ".docx"
}

func buildExportDocx(i Innhopp, takeoff, landing string, takeoffElevation *int, near, wide []byte) ([]byte, error) {
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	write := func(name, content string) error {
		f, e := z.Create(name)
		if e != nil {
			return e
		}
		_, e = f.Write([]byte(content))
		return e
	}
	if err := write("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`); err != nil {
		return nil, err
	}
	if err := write("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`); err != nil {
		return nil, err
	}
	if err := write("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/map-500m.png"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/map-2nm.png"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>`); err != nil {
		return nil, err
	}
	if err := write("word/styles.xml", `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults/><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="18"/></w:rPr></w:style></w:styles>`); err != nil {
		return nil, err
	}
	// Keep both square maps inside their 3.15-inch table cells and on page one.
	nearW, nearH := imageSizeEMU(near, 2700000)
	wideW, wideH := imageSizeEMU(wide, 2700000)
	var d strings.Builder
	d.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>`)
	paragraph(&d, fmt.Sprintf("%02d  %s", i.Sequence, i.Name), 22, true)
	d.WriteString(`<w:tbl><w:tblPr><w:jc w:val="center"/><w:tblW w:w="9066" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4533"/><w:gridCol w:w="4533"/></w:tblGrid><w:tr>`)
	d.WriteString(`<w:tc><w:tcPr><w:tcW w:w="4533" w:type="dxa"/></w:tcPr>`)
	imageRun(&d, "rId2", 1, nearW, nearH)
	d.WriteString(`</w:tc><w:tc><w:tcPr><w:tcW w:w="4533" w:type="dxa"/></w:tcPr>`)
	imageRun(&d, "rId3", 2, wideW, wideH)
	d.WriteString(`</w:tc></w:tr></w:tbl>`)
	fields := [][2]string{{"Date", formatExportDate(i.ScheduledAt)}, {"Name of location", i.Name}, {"HL", ""}, {"Reason for choice", i.ReasonForChoice}, {"Coordinates (DMS)", formatCoordinatesDMS(i.Coordinates)}, {"Coordinates (DMM)", formatCoordinatesDMM(i.Coordinates)}, {"Jumprun", i.Jumprun}, {"Elevation", formatElevation(i.Elevation)}, {"Elevation difference from airfield", formatElevationDifference(i.Elevation, takeoffElevation)}, {"Takeoff / landing", joinNonEmpty(takeoff, landing)}, {"NOTAM required", yesNoText(i.Notam)}, {"Distance by air", formatDistance(i.DistanceByAir)}, {"Distance by road", formatDistance(i.DistanceByRoad)}, {"Primary landing area name", i.PrimaryLandingArea.Name}, {"Primary landing area size", i.PrimaryLandingArea.Size}, {"Primary landing area obstacles", i.PrimaryLandingArea.Obstacles}, {"Primary landing area description", i.PrimaryLandingArea.Description}, {"Secondary landing area name", i.SecondaryLandingArea.Name}, {"Secondary landing area size", i.SecondaryLandingArea.Size}, {"Secondary landing area obstacles", i.SecondaryLandingArea.Obstacles}, {"Secondary landing area description", i.SecondaryLandingArea.Description}, {"Risk assessment", i.RiskAssessment}, {"Safety precautions", i.SafetyPrecautions}, {"Safety boat required", boolText(i.RescueBoat)}, {"Hospital", i.Hospital}, {"Minimum requirements", i.MinimumRequirements}, {"Land owner(s)", ownersText(i.LandOwners)}, {"Land owner's permission", boolText(i.LandOwnerPermission)}, {"Notes", i.Notes}}
	d.WriteString(`<w:tbl><w:tblPr><w:jc w:val="center"/><w:tblW w:w="9066" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="2500"/><w:gridCol w:w="6566"/></w:tblGrid>`)
	for _, f := range fields {
		d.WriteString(`<w:tr><w:trPr><w:trHeight w:val="300" w:hRule="atLeast"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="2500" w:type="dxa"/><w:vAlign w:val="center"/><w:shd w:val="clear" w:color="auto" w:fill="` + exportRowFill(f[0]) + `"/></w:tcPr>`)
		paragraph(&d, f[0], 18, true)
		d.WriteString(`</w:tc><w:tc><w:tcPr><w:tcW w:w="6566" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>`)
		if strings.TrimSpace(f[1]) == "" {
			d.WriteString(`<w:p/>`)
		} else {
			paragraph(&d, f[1], 18, false)
		}
		d.WriteString(`</w:tc></w:tr>`)
	}
	d.WriteString(`</w:tbl><w:sectPr><w:headerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="720"/></w:sectPr></w:body></w:document>`)
	if err := write("word/document.xml", d.String()); err != nil {
		return nil, err
	}
	footerWidth, footerHeight := imageSizeEMU(innhoppProjectLogo, 1600000)
	var header strings.Builder
	header.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">`)
	imageRun(&header, "rId1", 1, footerWidth, footerHeight)
	header.WriteString(`</w:hdr>`)
	if err := write("word/header1.xml", header.String()); err != nil {
		return nil, err
	}
	if err := write("word/_rels/header1.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/innhopp-project-logo.png"/></Relationships>`); err != nil {
		return nil, err
	}
	for _, item := range []struct {
		name string
		data []byte
	}{{"word/media/map-500m.png", near}, {"word/media/map-2nm.png", wide}, {"word/media/innhopp-project-logo.png", innhoppProjectLogo}} {
		f, e := z.Create(item.name)
		if e != nil {
			return nil, e
		}
		if _, e = f.Write(item.data); e != nil {
			return nil, e
		}
	}
	if err := z.Close(); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}

func xmlText(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(strings.TrimSpace(s)))
	return b.String()
}
func paragraph(b *strings.Builder, text string, size int, bold bool) {
	if strings.TrimSpace(text) == "" {
		return
	}
	b.WriteString(`<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="` + strconv.Itoa(size) + `"/><w:szCs w:val="` + strconv.Itoa(size) + `"/>`)
	if bold {
		b.WriteString(`<w:b/>`)
	}
	b.WriteString(`</w:rPr><w:t xml:space="preserve">` + xmlText(text) + `</w:t></w:r></w:p>`)
}
func imageSizeEMU(data []byte, max int64) (int64, int64) {
	c, _, e := image.DecodeConfig(bytes.NewReader(data))
	if e != nil || c.Width == 0 || c.Height == 0 {
		return max, max
	}
	w := max
	h := int64(float64(max) * float64(c.Height) / float64(c.Width))
	return w, h
}
func imageRun(b *strings.Builder, rel string, id int, w, h int64) {
	b.WriteString(fmt.Sprintf(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="%d" cy="%d"/><wp:docPr id="%d" name="Satellite map %d"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="%d" name="map.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="%s"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`, w, h, id, id, id, rel, w, h))
}
func formatExportDate(v *time.Time) string {
	if v == nil {
		return ""
	}
	return v.Format("2006-01-02 15:04")
}

func exportRowFill(label string) string {
	switch label {
	case "Date", "Name of location", "HL", "Reason for choice":
		return "FCE4D6" // location details
	case "Coordinates (DMS)", "Coordinates (DMM)", "Jumprun", "Elevation", "Elevation difference from airfield", "Takeoff / landing", "NOTAM required", "Distance by air", "Distance by road":
		return "A6A6A6" // navigation and flight details
	case "Primary landing area name", "Primary landing area size", "Primary landing area obstacles", "Primary landing area description", "Secondary landing area name", "Secondary landing area size", "Secondary landing area obstacles", "Secondary landing area description":
		return "E2F0D9" // landing areas
	case "Risk assessment", "Safety precautions", "Safety boat required", "Hospital", "Minimum requirements":
		return "DDEBF7" // safety
	case "Land owner(s)", "Land owner's permission":
		return "FFF2CC" // landowner approval
	default:
		return "FFFFFF"
	}
}

var exportDMS = regexp.MustCompile(`(?i)(\d{1,3})[°º]\s*(\d{1,2})['’]\s*(\d{1,2}(?:\.\d+)?)["”]?\s*([NSEW])`)

func exportCoordinatePair(raw string) (float64, float64, bool) {
	matches := exportDMS.FindAllStringSubmatch(raw, -1)
	if len(matches) >= 2 {
		first := exportDMSDecimal(matches[0])
		second := exportDMSDecimal(matches[1])
		if strings.EqualFold(matches[0][4], "E") || strings.EqualFold(matches[0][4], "W") {
			return second, first, true
		}
		return first, second, true
	}
	parts := strings.FieldsFunc(strings.TrimSpace(raw), func(r rune) bool { return r == ',' || r == ' ' || r == '\t' })
	if len(parts) < 2 {
		return 0, 0, false
	}
	lat, latErr := strconv.ParseFloat(parts[0], 64)
	lng, lngErr := strconv.ParseFloat(parts[1], 64)
	return lat, lng, latErr == nil && lngErr == nil && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

func exportDMSDecimal(match []string) float64 {
	degrees, _ := strconv.ParseFloat(match[1], 64)
	minutes, _ := strconv.ParseFloat(match[2], 64)
	seconds, _ := strconv.ParseFloat(match[3], 64)
	value := degrees + minutes/60 + seconds/3600
	if strings.EqualFold(match[4], "S") || strings.EqualFold(match[4], "W") {
		return -value
	}
	return value
}

func formatCoordinatesDMS(raw string) string {
	lat, lng, ok := exportCoordinatePair(raw)
	if !ok {
		return raw
	}
	return formatDMSCoordinate(lat, "N", "S") + " " + formatDMSCoordinate(lng, "E", "W")
}

func formatCoordinatesDMM(raw string) string {
	lat, lng, ok := exportCoordinatePair(raw)
	if !ok {
		return raw
	}
	return formatDMMCoordinate(lat, "N", "S") + " " + formatDMMCoordinate(lng, "E", "W")
}

func formatDMSCoordinate(value float64, positive, negative string) string {
	hemisphere := positive
	if value < 0 {
		hemisphere = negative
	}
	abs := math.Abs(value)
	degrees := int(math.Floor(abs))
	minutesFloat := (abs - float64(degrees)) * 60
	minutes := int(math.Floor(minutesFloat))
	seconds := (minutesFloat - float64(minutes)) * 60
	return fmt.Sprintf("%d°%02d'%05.2f\"%s", degrees, minutes, seconds, hemisphere)
}

func formatDMMCoordinate(value float64, positive, negative string) string {
	hemisphere := positive
	if value < 0 {
		hemisphere = negative
	}
	abs := math.Abs(value)
	degrees := int(math.Floor(abs))
	minutes := (abs - float64(degrees)) * 60
	return fmt.Sprintf("%d°%06.3f'%s", degrees, minutes, hemisphere)
}

func formatElevation(v *int) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%d m / %d ft MSL", *v, metersToFeet(*v))
}
func formatElevationDifference(elevation, airfieldElevation *int) string {
	if elevation == nil || airfieldElevation == nil {
		return ""
	}
	diff := *airfieldElevation - *elevation
	return fmt.Sprintf("%+d m / %+d ft", diff, metersToFeet(diff))
}
func metersToFeet(meters int) int { return int(math.Round(float64(meters) * 3.28084)) }
func formatDistance(v *float64) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%.1f km", *v)
}
func boolText(v *bool) string {
	if v == nil {
		return ""
	}
	if *v {
		return "Yes"
	}
	return "No"
}
func yesNoText(v string) string {
	if strings.TrimSpace(v) == "" {
		return ""
	}
	return v
}
func joinNonEmpty(v ...string) string { return strings.Join(filterNonEmpty(v), " / ") }
func filterNonEmpty(v []string) []string {
	r := []string{}
	for _, s := range v {
		if strings.TrimSpace(s) != "" {
			r = append(r, s)
		}
	}
	return r
}
func ownersText(owners []LandOwner) string {
	v := []string{}
	for _, o := range owners {
		v = append(v, strings.Join(filterNonEmpty([]string{o.Name, o.Telephone, o.Email}), " "))
	}
	return strings.Join(v, "; ")
}
