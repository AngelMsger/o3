package update

import "testing"

// release mirrors the asset set the release workflow actually attaches.
func release() []Asset {
	return []Asset{
		{Name: "o3-1.2.3-universal.dmg", BrowserDownloadURL: "https://dl/dmg"},
		{Name: "o3-1.2.3-windows-amd64-setup.exe", BrowserDownloadURL: "https://dl/setup"},
		{Name: "o3-1.2.3-windows-amd64-portable.zip", BrowserDownloadURL: "https://dl/zip"},
		{Name: "o3-1.2.3-x86_64.AppImage", BrowserDownloadURL: "https://dl/appimage"},
	}
}

const fallback = "https://github.com/AngelMsger/o3/releases/tag/v1.2.3"

func TestPickAsset(t *testing.T) {
	tests := []struct {
		name     string
		assets   []Asset
		goos     string
		goarch   string
		wantURL  string
		wantName string
	}{
		{
			name:   "darwin arm64 takes the universal dmg",
			assets: release(), goos: "darwin", goarch: "arm64",
			wantURL: "https://dl/dmg", wantName: "o3-1.2.3-universal.dmg",
		},
		{
			name:   "darwin amd64 takes the same universal dmg",
			assets: release(), goos: "darwin", goarch: "amd64",
			wantURL: "https://dl/dmg", wantName: "o3-1.2.3-universal.dmg",
		},
		{
			name:   "windows amd64 prefers the installer over the portable zip",
			assets: release(), goos: "windows", goarch: "amd64",
			wantURL: "https://dl/setup", wantName: "o3-1.2.3-windows-amd64-setup.exe",
		},
		{
			name:   "linux amd64 takes the AppImage despite its mixed-case extension",
			assets: release(), goos: "linux", goarch: "amd64",
			wantURL: "https://dl/appimage", wantName: "o3-1.2.3-x86_64.AppImage",
		},
		{
			name:   "windows falls back to the portable zip when no installer shipped",
			assets: []Asset{{Name: "o3-1.2.3-windows-amd64-portable.zip", BrowserDownloadURL: "https://dl/zip"}},
			goos:   "windows", goarch: "amd64",
			wantURL: "https://dl/zip", wantName: "o3-1.2.3-windows-amd64-portable.zip",
		},
		{
			name:   "unsupported platform falls back to the release page",
			assets: release(), goos: "linux", goarch: "arm64",
			wantURL: fallback, wantName: "",
		},
		{
			name:   "windows arm64 has no build and falls back",
			assets: release(), goos: "windows", goarch: "arm64",
			wantURL: fallback, wantName: "",
		},
		{
			name:   "an empty release falls back",
			assets: nil, goos: "darwin", goarch: "arm64",
			wantURL: fallback, wantName: "",
		},
		{
			name:   "an asset with no download URL is skipped",
			assets: []Asset{{Name: "o3-1.2.3-universal.dmg"}},
			goos:   "darwin", goarch: "arm64",
			wantURL: fallback, wantName: "",
		},
		{
			name: "checksums and source tarballs are never picked",
			assets: []Asset{
				{Name: "checksums.txt", BrowserDownloadURL: "https://dl/sums"},
				{Name: "Source code (zip)", BrowserDownloadURL: "https://dl/src"},
			},
			goos: "darwin", goarch: "arm64",
			wantURL: fallback, wantName: "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url, name := PickAsset(tt.assets, tt.goos, tt.goarch, fallback)
			if url != tt.wantURL || name != tt.wantName {
				t.Errorf("PickAsset() = (%q, %q), want (%q, %q)", url, name, tt.wantURL, tt.wantName)
			}
		})
	}
}
