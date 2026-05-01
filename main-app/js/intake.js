import { supabase } from "../../shared/supabase.js";
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

  const payload = payloadFromForm();
  const { data, error } = await supabase.rpc("submit_public_person", {
    p_full_name: payload.full_name,
    p_email: payload.email,
    p_phone: payload.phone,
    p_area_of_residence: payload.area_of_residence,
    p_dob: payload.dob,
    p_gender: payload.gender,
    p_occupation: payload.occupation,
    p_marital_status: payload.marital_status,
    p_service_feedback: payload.service_feedback
      ? `${payload.service_feedback}${document.getElementById("intakeServiceAttended").value.trim() ? ` | Service attended: ${document.getElementById("intakeServiceAttended").value.trim()}` : ""}`
      : document.getElementById("intakeServiceAttended").value.trim()
        ? `Service attended: ${document.getElementById("intakeServiceAttended").value.trim()}`
        : "",
    p_nsppdian: payload.nsppdian,
    p_next_sunday: payload.next_sunday,
    p_membership_interest: payload.membership_interest,
    p_whatsapp_group: payload.whatsapp_group,
    p_prayer_points: payload.prayer_points,
    p_invite: payload.invite,
    p_invite_details: payload.invite_details,
  });

  if (error) {
    setMessage(publicIntakeMessage, error.message || "We could not submit the form right now.", "error");
    return;
  }

  publicIntakeForm.reset();
  setMessage(publicIntakeMessage, `Thank you. Your information has been received successfully. Reference: ${data}`, "success");
});
