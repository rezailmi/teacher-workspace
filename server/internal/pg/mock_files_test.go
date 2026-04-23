package pg

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/String-sg/teacher-workspace/server/pkg/require"
)

// newFilesMux wires just the file routes so tests don't pull in the full
// handler tree.
func newFilesMux() *http.ServeMux {
	mux := http.NewServeMux()
	registerMockFiles(mux)
	return mux
}

// preUploadBody builds a minimal valid multipart body for the
// preUploadValidation endpoint.
func preUploadBody(t *testing.T) (body *bytes.Buffer, contentType string) {
	t.Helper()
	buf := &bytes.Buffer{}
	w := multipart.NewWriter(buf)

	fileField, err := w.CreateFormFile("file", "permission_slip.pdf")
	if err != nil {
		t.Fatalf("want nil, got: %v", err)
	}
	if _, err := fileField.Write([]byte("pretend pdf bytes")); err != nil {
		t.Fatalf("want nil, got: %v", err)
	}
	for k, v := range map[string]string{
		"type":     "ANNOUNCEMENT",
		"mimeType": "application/pdf",
		"fileSize": "1234",
	} {
		if err := w.WriteField(k, v); err != nil {
			t.Fatalf("want nil, got: %v", err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatalf("want nil, got: %v", err)
	}
	return buf, w.FormDataContentType()
}

func TestMockFiles_preUploadValidation(t *testing.T) {
	t.Run("returns attachmentId and presigned URL pointing at mockUpload", func(t *testing.T) {
		mux := newFilesMux()
		body, ctype := preUploadBody(t)

		req := httptest.NewRequest(http.MethodPost, "/api/files/2/preUploadValidation", body)
		req.Header.Set("Content-Type", ctype)
		rec := httptest.NewRecorder()

		mux.ServeHTTP(rec, req)

		require.Equal(t, http.StatusOK, rec.Code)

		var resp struct {
			AttachmentID int64             `json:"attachmentId"`
			PresignedURL string            `json:"presignedUrl"`
			Fields       map[string]string `json:"fields"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("want nil, got: %v", err)
		}

		if resp.AttachmentID <= 10_000 {
			t.Errorf("want attachmentId > 10000, got: %d", resp.AttachmentID)
		}
		if !strings.Contains(resp.PresignedURL, "/api/files/2/mockUpload?attachmentId=") {
			t.Errorf("want presignedUrl containing mockUpload path, got: %q", resp.PresignedURL)
		}
	})

	t.Run("mints monotonically increasing ids across calls", func(t *testing.T) {
		mux := newFilesMux()

		call := func() int64 {
			body, ctype := preUploadBody(t)
			req := httptest.NewRequest(http.MethodPost, "/api/files/2/preUploadValidation", body)
			req.Header.Set("Content-Type", ctype)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			var resp struct {
				AttachmentID int64 `json:"attachmentId"`
			}
			_ = json.Unmarshal(rec.Body.Bytes(), &resp)
			return resp.AttachmentID
		}

		first := call()
		second := call()
		if second <= first {
			t.Errorf("want second id > first (%d), got: %d", first, second)
		}
	})
}

func TestMockFiles_mockUpload(t *testing.T) {
	t.Run("returns 204 regardless of body", func(t *testing.T) {
		mux := newFilesMux()

		req := httptest.NewRequest(http.MethodPost, "/api/files/2/mockUpload?attachmentId=10001", io.NopCloser(strings.NewReader("blob-bytes")))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		require.Equal(t, http.StatusNoContent, rec.Code)
	})
}

func TestMockFiles_postUploadVerification(t *testing.T) {
	t.Run("returns verified true unconditionally", func(t *testing.T) {
		mux := newFilesMux()

		req := httptest.NewRequest(http.MethodGet, "/api/files/2/postUploadVerification?attachmentId=10042", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		require.Equal(t, http.StatusOK, rec.Code)

		var resp struct {
			Verified bool `json:"verified"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("want nil, got: %v", err)
		}
		require.Equal(t, true, resp.Verified)
	})
}
