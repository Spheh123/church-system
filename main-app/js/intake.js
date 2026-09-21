import { supabase } from "../../shared/supabase.js";
import { clearMessage, setMessage } from "./auth.js";

const publicIntakeForm = document.getElementById("publicIntakeForm");
const publicIntakeMessage = document.getElementById("publicIntakeMessage");
const serviceDate = document.getElementById("intakeServiceDate");
serviceDate.value = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
let submitting = false;

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
  if (submitting) return;
  clearMessage(publicIntakeMessage);

  if (document.getElementById("intakeWebsite").value.trim()) {
    setMessage(publicIntakeMessage, "Submission blocked.", "error");
    return;
  }

  const payload = payloadFromForm();
  const selectedDate = serviceDate.value;
  const selectedService = document.getElementById("intakeServiceAttended").value;
  const submitButton = publicIntakeForm.querySelector('button[type="submit"]');
  submitting = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Saving visitor…';
  try {
  const { data, error } = await supabase.rpc("submit_public_visit", {
    p_visit_date: selectedDate,
    p_data: {...payload, service_feedback: [payload.service_feedback, `Service date: ${selectedDate}`, selectedService.trim() ? `Service attended: ${selectedService.trim()}` : '', 'Visitor agreed to church care and follow-up.'].filter(Boolean).join(' | ')},
  });

  if (error) {
    setMessage(publicIntakeMessage, error.message || "We could not submit the form right now.", "error");
    return;
  }

  publicIntakeForm.reset();
  serviceDate.value = selectedDate;
  document.getElementById("intakeServiceAttended").value = selectedService;
  setMessage(publicIntakeMessage, `${payload.full_name} has been saved. You can enter the next visitor. Reference: ${data}`, "success");
  } catch {
    setMessage(publicIntakeMessage, 'We could not confirm the save. Keep this form open and ask an admin to check whether this visitor arrived before submitting again.', 'error');
  } finally {
    submitting = false;
    submitButton.disabled = false;
    submitButton.textContent = 'Submit visitor form';
    publicIntakeMessage.focus();
  }
});
