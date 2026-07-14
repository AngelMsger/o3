package update

import "strings"

// Asset is one file attached to a GitHub release.
type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
	ContentType        string `json:"content_type"`
}

// platformSuffixes lists the asset-name suffixes to try for a platform, best
// first. The names come from the release pipeline: scripts/dmg.sh writes
// o3-<v>-universal.dmg, .github/workflows/release.yml writes
// o3-<v>-windows-amd64-setup.exe and o3-<v>-windows-amd64-portable.zip, and
// scripts/appimage.sh writes o3-<v>-x86_64.AppImage.
//
// Matching on a suffix rather than reconstructing the whole filename from the
// version means a version-string mismatch (a stray "v" prefix, a +build suffix
// in the tag but not the filename) cannot silently break the download button.
var platformSuffixes = map[string][]string{
	// The macOS build is a single universal binary, so the arch does not matter.
	"darwin": {"-universal.dmg", ".dmg"},
	// The installer is preferred; the portable zip is a graceful second.
	"windows/amd64": {"-windows-amd64-setup.exe", "-setup.exe", "-windows-amd64-portable.zip"},
	"linux/amd64":   {"-x86_64.appimage", ".appimage"},
}

// suffixesFor returns the candidate suffixes for a GOOS/GOARCH pair, or nil when
// the platform has no published build (windows/arm64, linux/arm64, ...).
func suffixesFor(goos, goarch string) []string {
	if goos == "darwin" {
		return platformSuffixes["darwin"]
	}
	return platformSuffixes[goos+"/"+goarch]
}

// PickAsset returns the download URL and asset name for this platform. When no
// asset matches — an unsupported platform, or a release that shipped nothing —
// it returns (fallbackURL, ""), and the caller shows a generic "open the release
// page" action instead of a download.
func PickAsset(assets []Asset, goos, goarch, fallbackURL string) (downloadURL, assetName string) {
	for _, suffix := range suffixesFor(goos, goarch) {
		for _, a := range assets {
			if a.BrowserDownloadURL == "" {
				continue
			}
			if strings.HasSuffix(strings.ToLower(a.Name), suffix) {
				return a.BrowserDownloadURL, a.Name
			}
		}
	}
	return fallbackURL, ""
}
