package pg

import (
	"embed"
	"encoding/json"
	"net/http"
	"strconv"
	"sync/atomic"
)

//go:embed fixtures
var fixtures embed.FS

// Detail-endpoint fixture lookup by ID segment. Keeping the map here (rather
// than a dispatching switch) means adding a new status just edits one row —
// and requests for unknown IDs return 404 instead of leaking a stale payload
// from some sibling status.
var announcementDetailByID = map[string]string{
	"1036": "fixtures/announcement_detail.json",           // POSTED view-only
	"1037": "fixtures/announcement_detail_yes_no.json",    // POSTED yes/no
	"1038": "fixtures/announcement_detail_scheduled.json", // SCHEDULED
	"1039": "fixtures/announcement_detail_draft.json",     // DRAFT
}

var consentFormDetailByID = map[string]string{
	"1038": "fixtures/consent_form_detail.json",           // OPEN
	"1039": "fixtures/consent_form_detail_closed.json",    // CLOSED
	"1040": "fixtures/consent_form_detail_draft.json",     // DRAFT
	"1041": "fixtures/consent_form_detail_scheduled.json", // SCHEDULED
}

func (h *Handler) registerMock(mux *http.ServeMux) {
	registerMockSession(mux)
	registerMockAnnouncements(mux)
	registerMockConsentForms(mux)
	registerMockPTM(mux)
	registerMockGroups(mux)
	registerMockSchool(mux)
	registerMockMessageGroups(mux)
	registerMockHQDownloads(mux)
	registerMockAccount(mux)
	registerMockHeyTalia(mux)
	registerMockFiles(mux)
	registerMockPlatform(mux)
}

// ─── Session & config ───────────────────────────────────────────────────────

func registerMockSession(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/web/2/staff/session/current", serveFixture("fixtures/session_current.json"))
	mux.HandleFunc("GET /api/configs", serveFixture("fixtures/configs.json"))
}

// ─── Announcements ──────────────────────────────────────────────────────────

func registerMockAnnouncements(mux *http.ServeMux) {
	// Reads
	mux.HandleFunc("GET /api/web/2/staff/announcements", serveFixture("fixtures/announcements.json"))
	mux.HandleFunc("GET /api/web/2/staff/announcements/shared", serveFixture("fixtures/announcements_shared.json"))
	mux.HandleFunc("GET /api/web/2/staff/announcements/{postId}", func(w http.ResponseWriter, r *http.Request) {
		path, ok := announcementDetailByID[r.PathValue("postId")]
		if !ok {
			http.NotFound(w, r)
			return
		}
		serveFixture(path)(w, r)
	})

	// 3-segment GET dispatcher: drafts/{id} | prefilled/{id}.
	// (PGW does not expose a standalone `/{postId}/readStatus`; read status is embedded in
	// the detail response — see docs/audits/pg-backend-contract.md.)
	mux.HandleFunc("GET /api/web/2/staff/announcements/{first}/{second}", func(w http.ResponseWriter, r *http.Request) {
		switch r.PathValue("first") {
		case "drafts", "prefilled":
			serveFixture("fixtures/announcement_draft.json")(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	// 2-segment POSTs
	mux.HandleFunc("POST /api/web/2/staff/announcements", jsonStub(http.StatusCreated, `{"postId":1041}`))
	mux.HandleFunc("POST /api/web/2/staff/announcements/drafts", jsonStub(http.StatusCreated, `{"announcementDraftId":202}`))
	mux.HandleFunc("POST /api/web/2/staff/announcements/duplicate", jsonStub(http.StatusCreated, `{"announcementDraftId":1042,"updatedAt":"2026-04-28T00:00:00.000Z"}`))

	// 3-segment POST dispatcher: drafts/schedule | drafts/duplicate | {id}/addStaffInCharge
	mux.HandleFunc("POST /api/web/2/staff/announcements/{first}/{second}", func(w http.ResponseWriter, r *http.Request) {
		first, second := r.PathValue("first"), r.PathValue("second")
		switch {
		case first == "drafts" && second == "schedule":
			jsonStub(http.StatusOK, `{}`)(w, r)
		case first == "drafts" && second == "duplicate":
			jsonStub(http.StatusCreated, `{"announcementDraftId":203,"updatedAt":"2026-04-28T00:00:00.000Z"}`)(w, r)
		case second == "addStaffInCharge":
			jsonStub(http.StatusOK, `{}`)(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	// 4-segment POST: drafts/{id}/cancelSchedule
	mux.HandleFunc("POST /api/web/2/staff/announcements/drafts/{announcementDraftId}/cancelSchedule", jsonStub(http.StatusOK, `{}`))

	// 3-segment PUT dispatcher: drafts/{id} | {id}/enquiryEmailAddress | {id}/removeAccess
	mux.HandleFunc("PUT /api/web/2/staff/announcements/{first}/{second}", func(w http.ResponseWriter, r *http.Request) {
		first, second := r.PathValue("first"), r.PathValue("second")
		switch {
		case first == "drafts":
			jsonStub(http.StatusOK, `{}`)(w, r)
		case second == "enquiryEmailAddress", second == "removeAccess":
			jsonStub(http.StatusOK, `{}`)(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	// 4-segment PUT dispatcher: drafts/schedule/{id} | drafts/{id}/rescheduleSchedule
	mux.HandleFunc("PUT /api/web/2/staff/announcements/{a}/{b}/{c}", func(w http.ResponseWriter, r *http.Request) {
		a, b, c := r.PathValue("a"), r.PathValue("b"), r.PathValue("c")
		switch {
		case a == "drafts" && b == "schedule":
			jsonStub(http.StatusOK, `{}`)(w, r)
		case a == "drafts" && c == "rescheduleSchedule":
			jsonStub(http.StatusOK, `{}`)(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	// Deletes
	mux.HandleFunc("DELETE /api/web/2/staff/announcements/{postId}", noContent)
	mux.HandleFunc("DELETE /api/web/2/staff/announcements/drafts/{announcementDraftId}", noContent)
}

// ─── Consent forms ──────────────────────────────────────────────────────────

func registerMockConsentForms(mux *http.ServeMux) {
	// Reads
	mux.HandleFunc("GET /api/web/2/staff/consentForms", serveFixture("fixtures/consent_forms.json"))
	mux.HandleFunc("GET /api/web/2/staff/consentForms/shared", serveFixture("fixtures/consent_forms.json"))
	mux.HandleFunc("GET /api/web/2/staff/consentForms/drafts/{consentFormDraftId}", serveFixture("fixtures/consent_form_draft.json"))
	mux.HandleFunc("GET /api/web/2/staff/consentForms/{consentFormId}", func(w http.ResponseWriter, r *http.Request) {
		path, ok := consentFormDetailByID[r.PathValue("consentFormId")]
		if !ok {
			http.NotFound(w, r)
			return
		}
		serveFixture(path)(w, r)
	})

	// 2-segment POSTs
	mux.HandleFunc("POST /api/web/2/staff/consentForms", jsonStub(http.StatusCreated, `{"consentFormId":301}`))
	mux.HandleFunc("POST /api/web/2/staff/consentForms/drafts", jsonStub(http.StatusCreated, `{"consentFormDraftId":401}`))
	mux.HandleFunc("POST /api/web/2/staff/consentForms/duplicate", jsonStub(http.StatusCreated, `{"consentFormDraftId":402,"updatedAt":"2026-04-28T00:00:00.000Z"}`))

	// 3-segment POST dispatcher: drafts/schedule | drafts/duplicate | {id}/addStaffInCharge
	mux.HandleFunc("POST /api/web/2/staff/consentForms/{first}/{second}", func(w http.ResponseWriter, r *http.Request) {
		first, second := r.PathValue("first"), r.PathValue("second")
		switch {
		case first == "drafts" && second == "schedule":
			jsonStub(http.StatusOK, `{}`)(w, r)
		case first == "drafts" && second == "duplicate":
			jsonStub(http.StatusCreated, `{"consentFormDraftId":403,"updatedAt":"2026-04-28T00:00:00.000Z"}`)(w, r)
		case second == "addStaffInCharge":
			jsonStub(http.StatusOK, `{}`)(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	// 4-segment POST: drafts/{id}/cancelSchedule
	mux.HandleFunc("POST /api/web/2/staff/consentForms/drafts/{consentFormDraftId}/cancelSchedule", jsonStub(http.StatusOK, `{}`))

	// 3-segment PUT dispatcher: drafts/{id} | {id}/updateDueDate | {id}/updateEnquiryEmail | {id}/removeAccess
	mux.HandleFunc("PUT /api/web/2/staff/consentForms/{first}/{second}", func(w http.ResponseWriter, r *http.Request) {
		first, second := r.PathValue("first"), r.PathValue("second")
		switch {
		case first == "drafts":
			jsonStub(http.StatusOK, `{}`)(w, r)
		case second == "updateDueDate", second == "updateEnquiryEmail", second == "removeAccess":
			jsonStub(http.StatusOK, `{}`)(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	// 4-segment PUT dispatcher: drafts/schedule/{id} | drafts/{id}/rescheduleSchedule
	mux.HandleFunc("PUT /api/web/2/staff/consentForms/{a}/{b}/{c}", func(w http.ResponseWriter, r *http.Request) {
		a, b, c := r.PathValue("a"), r.PathValue("b"), r.PathValue("c")
		switch {
		case a == "drafts" && b == "schedule":
			jsonStub(http.StatusOK, `{}`)(w, r)
		case a == "drafts" && c == "rescheduleSchedule":
			jsonStub(http.StatusOK, `{}`)(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	// 5-segment PUT: {id}/student/{studentId}/reply
	mux.HandleFunc("PUT /api/web/2/staff/consentForms/{consentFormId}/student/{studentId}/reply", jsonStub(http.StatusOK, `{}`))

	// Deletes
	mux.HandleFunc("DELETE /api/web/2/staff/consentForms/{consentFormId}", noContent)
	mux.HandleFunc("DELETE /api/web/2/staff/consentForms/drafts/{consentFormDraftId}", noContent)
}

// ─── Meetings (PTM) ─────────────────────────────────────────────────────────

func registerMockPTM(mux *http.ServeMux) {
	// Top-level GETs
	mux.HandleFunc("GET /api/web/2/staff/ptm", serveFixture("fixtures/meetings.json"))
	mux.HandleFunc("GET /api/web/2/staff/ptm/serverdatetime", serveFixture("fixtures/ptm_serverdatetime.json"))
	mux.HandleFunc("GET /api/web/2/staff/ptm/{eventId}", serveFixture("fixtures/meeting_detail.json"))

	// 3-segment GET dispatcher: {literal}/{id} routes conflict with {eventId}/targetStudents
	// (e.g. `timeslots/targetStudents` would match both patterns). Use explicit dispatch.
	mux.HandleFunc("GET /api/web/2/staff/ptm/{first}/{second}", func(w http.ResponseWriter, r *http.Request) {
		switch r.PathValue("first") {
		case "timeslots":
			serveFixture("fixtures/meeting_timeslots.json")(w, r)
		case "bookings":
			serveFixture("fixtures/meeting_bookings.json")(w, r)
		case "schedule":
			serveFixture("fixtures/meeting_schedule.json")(w, r)
		case "booking":
			serveFixture("fixtures/meeting_booking.json")(w, r)
		default:
			if r.PathValue("second") == "targetStudents" {
				serveFixture("fixtures/meeting_target_students.json")(w, r)
				return
			}
			http.NotFound(w, r)
		}
	})

	// Writes
	mux.HandleFunc("POST /api/web/2/staff/ptm", jsonStub(http.StatusCreated, `{"eventId":1002}`))
	mux.HandleFunc("DELETE /api/web/2/staff/ptm/{eventId}", noContent)

	// 3-segment POST dispatcher: booking/{action} | {eventId}/addStaffInCharge
	mux.HandleFunc("POST /api/web/2/staff/ptm/{first}/{second}", func(w http.ResponseWriter, r *http.Request) {
		first, second := r.PathValue("first"), r.PathValue("second")
		switch {
		case first == "booking" && (second == "block" || second == "unblock" || second == "add" || second == "change" || second == "remove"):
			jsonStub(http.StatusOK, `{}`)(w, r)
		case first == "booking" && second == "validate":
			jsonStub(http.StatusOK, `{"valid":true}`)(w, r)
		case second == "addStaffInCharge":
			jsonStub(http.StatusOK, `{}`)(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	// 3-segment PUT: {eventId}/removeAccess | {eventId}/updateEnquiryEmail
	mux.HandleFunc("PUT /api/web/2/staff/ptm/{eventId}/removeAccess", jsonStub(http.StatusOK, `{}`))
	mux.HandleFunc("PUT /api/web/2/staff/ptm/{eventId}/updateEnquiryEmail", jsonStub(http.StatusOK, `{}`))
}

// ─── Groups ─────────────────────────────────────────────────────────────────

func registerMockGroups(mux *http.ServeMux) {
	// Reads
	mux.HandleFunc("GET /api/web/2/staff/groups/assigned", serveFixture("fixtures/groups_assigned.json"))
	mux.HandleFunc("GET /api/web/2/staff/groups/custom", serveFixture("fixtures/groups_custom.json"))
	mux.HandleFunc("GET /api/web/2/staff/groups/custom/{customGroupId}", serveFixture("fixtures/group_custom_detail.json"))
	mux.HandleFunc("GET /api/web/2/staff/groups/classes/{classId}", serveFixture("fixtures/class_detail.json"))
	mux.HandleFunc("GET /api/web/2/staff/groups/cca/students/{ccaId}", serveFixture("fixtures/cca_students.json"))

	// Writes
	mux.HandleFunc("POST /api/web/2/staff/groups/custom", jsonStub(http.StatusCreated, `{"customGroupId":6}`))
	mux.HandleFunc("POST /api/web/2/staff/groups/custom/validateStudents", jsonStub(http.StatusOK, `{"valid":true}`))
	mux.HandleFunc("POST /api/web/2/staff/groups/custom/validateStudents/results", jsonStub(http.StatusOK, `{"valid":true,"errors":[]}`))
	mux.HandleFunc("POST /api/web/2/staff/groups/student/count", jsonStub(http.StatusOK, `{"count":30}`))
	mux.HandleFunc("PUT /api/web/2/staff/groups/custom/{customGroupId}", jsonStub(http.StatusOK, `{}`))
	mux.HandleFunc("PUT /api/web/2/staff/groups/custom/{customGroupId}/share", jsonStub(http.StatusOK, `{}`))
	mux.HandleFunc("PUT /api/web/2/staff/groups/custom/{customGroupId}/removeAccess", jsonStub(http.StatusOK, `{}`))
	mux.HandleFunc("DELETE /api/web/2/staff/groups/custom/{customGroupId}", noContent)
}

// ─── School data ────────────────────────────────────────────────────────────

func registerMockSchool(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/web/2/staff/school/staff", serveFixture("fixtures/school_staff.json"))
	mux.HandleFunc("GET /api/web/2/staff/school/students", serveFixture("fixtures/school_students.json"))
	mux.HandleFunc("GET /api/web/2/staff/school/groups", serveFixture("fixtures/school_groups.json"))
	mux.HandleFunc("GET /api/web/2/staff/school/studentGroups", serveFixture("fixtures/school_student_groups.json"))
	mux.HandleFunc("GET /api/web/2/staff/school/students/retrieveReport", jsonStub(http.StatusOK, `{}`))
	mux.HandleFunc("POST /api/web/2/staff/school/travelDeclaration", jsonStub(http.StatusOK, `{}`))
}

// ─── Message groups ─────────────────────────────────────────────────────────

func registerMockMessageGroups(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/web/2/staff/messageGroups", serveFixture("fixtures/message_groups.json"))
	mux.HandleFunc("POST /api/web/2/staff/messageGroups", jsonStub(http.StatusCreated, `{"staffMessageGroupId":10}`))
	mux.HandleFunc("DELETE /api/web/2/staff/messageGroups/{staffMessageGroupId}", noContent)
}

// ─── HQ announcement downloads ──────────────────────────────────────────────

func registerMockHQDownloads(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/web/2/staff/hq-announcement-downloads/{code}", jsonStub(http.StatusOK, `{}`))
}

// ─── Account & notification prefs ───────────────────────────────────────────

func registerMockAccount(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/web/2/staff/users/me", serveFixture("fixtures/users_me.json"))
	mux.HandleFunc("GET /api/web/2/staff/notificationPreference", serveFixture("fixtures/notification_preferences.json"))
	mux.HandleFunc("PUT /api/web/2/staff/notificationPreference", jsonStub(http.StatusOK, `{}`))
	mux.HandleFunc("PUT /api/web/2/staff/{staffId}/updateDisplayEmail", jsonStub(http.StatusOK, `{}`))
	mux.HandleFunc("PUT /api/web/2/staff/{staffId}/updateDisplayName", jsonStub(http.StatusOK, `{}`))
}

// ─── HeyTalia (AI chat) ─────────────────────────────────────────────────────

func registerMockHeyTalia(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/web/2/staff/heytalia/chat", jsonStub(http.StatusOK, `{"response":"mocked — HeyTalia disabled in experiment."}`))
	mux.HandleFunc("POST /api/web/2/staff/heytalia/feedback", jsonStub(http.StatusOK, `{}`))
	mux.HandleFunc("POST /api/web/2/staff/heytalia/email", jsonStub(http.StatusOK, `{}`))
	mux.HandleFunc("GET /api/web/2/staff/heytalia/email/recipients/history", serveFixture("fixtures/heytalia_email_recipients_history.json"))
	mux.HandleFunc("POST /api/web/2/staff/heytalia/upload-file", jsonStub(http.StatusOK, `{"fileId":"mock-file-1"}`))
	mux.HandleFunc("POST /api/web/2/staff/heytalia/metrics", jsonStub(http.StatusOK, `{}`))
	mux.HandleFunc("GET /api/web/2/staff/heytalia/conversations", serveFixture("fixtures/heytalia_conversations.json"))
	mux.HandleFunc("GET /api/web/2/staff/heytalia/conversations/{conversationId}", serveFixture("fixtures/heytalia_conversation.json"))
	mux.HandleFunc("POST /api/web/2/staff/heytalia/conversations/delete", jsonStub(http.StatusOK, `{}`))
	mux.HandleFunc("POST /api/web/2/staff/heytalia/conversations/system-message", jsonStub(http.StatusOK, `{}`))
}

// ─── Files ──────────────────────────────────────────────────────────────────

// mockAttachmentIDCounter mints monotonic attachment IDs for the mock
// preUploadValidation handler. Seeded at 10_000 so mock IDs can't collide
// with fixture IDs (which live in the 1000s).
var mockAttachmentIDCounter atomic.Int64

func init() {
	mockAttachmentIDCounter.Store(10_000)
}

func registerMockFiles(mux *http.ServeMux) {
	// Real PG flow: preUploadValidation returns a presigned S3 URL. Mock
	// points the "presigned URL" at our own /mockUpload route so dev
	// round-trips without external S3.
	mux.HandleFunc("POST /api/files/2/preUploadValidation", handleMockPreUpload)
	mux.HandleFunc("POST /api/files/2/mockUpload", noContent)
	// AV scan is instant in the mock; `verified: true` is unconditional.
	mux.HandleFunc("GET /api/files/2/postUploadVerification", jsonStub(http.StatusOK, `{"verified":true}`))
	mux.HandleFunc("GET /api/files/2/handleDownloadAttachment", jsonStub(http.StatusOK, `{}`))
	mux.HandleFunc("GET /api/files/2/scanResult", jsonStub(http.StatusOK, `{"status":"clean"}`))
	mux.HandleFunc("GET /api/files/2/handleResizeImageNotFound", noContent)
}

func handleMockPreUpload(w http.ResponseWriter, r *http.Request) {
	// Parse generously — real PG accepts up to 5 MB per file; we don't need
	// to retain the body, just drain the multipart so the client sees a 200.
	// ParseMultipartForm errors are non-fatal for the mock — real PG might
	// tighten these checks, but the tests drive the mock with well-formed
	// payloads and a permissive mock is less brittle than a strict one.
	_ = r.ParseMultipartForm(6 << 20)

	id := mockAttachmentIDCounter.Add(1)
	resp := map[string]any{
		"attachmentId": id,
		"presignedUrl": "/api/files/2/mockUpload?attachmentId=" + strconv.FormatInt(id, 10),
		"fields":       map[string]string{},
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

// ─── Platform (feature flags, web notifications) ────────────────────────────

func registerMockPlatform(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/feature/2/flags", serveFixture("fixtures/feature_flags.json"))
	mux.HandleFunc("GET /api/web/2/webNotification", serveFixture("fixtures/web_notifications.json"))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

func serveFixture(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := fixtures.ReadFile(path)
		if err != nil {
			http.Error(w, "fixture not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json; charset=UTF-8")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	}
}

func jsonStub(statusCode int, body string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=UTF-8")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.WriteHeader(statusCode)
		_, _ = w.Write([]byte(body))
	}
}

var noContent http.HandlerFunc = func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}
