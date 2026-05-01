import { appConfig } from "../../shared/config.js";
import { clearMessage, setMessage } from "./auth.js";

const publicIntakeForm = document.getElementById("publicIntakeForm");
const publicIntakeMessage = document.getElementById("publicIntakeMessage");

function payloadFromForm() {
  return {
    source: "public_form",
    full_name: document.getElementById("intakeFullName").value.trim(),
    email: document.getElementById("intakeEmail").value.trim(),
    phone: document.getElementById("intakePhone").value.trim(),
    area_of_residence: document.getElementById("intakeArea").value.trim(),
    dob: document.getElementById("intakeDob").value.trim(),
    gender: document.getElementById("intakeGender").value.trim(),
    occupation: document.getElementById("intakeOccupation").value.trim(),
    marital_status: document.getElementById("intakeMaritalStatus").value.trim(),
    service_feedback: document.getElementById("intakeServiceFeedback").value.trim(),
    nsppdian: document.getElementById("intakeNsppdian").value.trim(),
    next_sunday: document.getElementById("intakeNextSunday").value.trim(),
    membership_interest: document.getElementById("intakeMembershipInterest").value.trim(),
    whatsapp_group: document.getElementById("intakeWhatsappGroup").value.trim(),
    prayer_points: document.getElementById("intakePrayerPoints").value.trim(),
    invite: document.getElementById("intakeInvite").value.trim(),
    invite_details: document.getElementById("intakeInviteDetails").value.trim(),
  };
}

publicIntakeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(publicIntakeMessage);

  if (document.getElementById("intakeWebsite").value.trim()) {
    setMessage(publicIntakeMessage, "Submission blocked.", "error");
    return;
  }

  const response = await fetch(appConfig.formWebhookPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payloadFromForm()),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    setMessage(publicIntakeMessage, result.error || "We could not submit the form right now.", "error");
    return;
  }

  publicIntakeForm.reset();
  setMessage(publicIntakeMessage, "Thank you. Your information has been received successfully.", "success");
});
