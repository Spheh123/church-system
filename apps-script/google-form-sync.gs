function syncVisitorToChurchWorkspace(e) {
  var values = e.namedValues || {};
  var payload = {
    source_id: e.source.getId() + ":" + e.range.getSheet().getSheetId() + ":" + e.range.getRow(),
    timestamp: firstValue(values, ["Timestamp"]),
    full_name: firstValue(values, ["Full Name and Surname", "Full Name", "Name", "Full name"]),
    email: firstValue(values, ["Email", "Email Address", "Email address"]),
    phone: firstValue(values, ["Cell phone number", "Cellphone Number", "Cell phone number ", "Phone", "Cellphone", "Phone Number"]),
    area_of_residence: firstValue(values, [
      "Which area do you reside in (e.g., Midrand, Tembisa, Morningside)?",
      "Area of Residence",
      "Area of residence",
      "Residence",
      "Place of Residence",
    ]),
    dob: firstValue(values, ["Please provide your Date of Birth so we can celebrate your birthday with you!", "Date of Birth", "DOB", "Date of birth"]),
    gender: firstValue(values, ["Gender"]),
    occupation: firstValue(values, ["Occupation"]),
    marital_status: firstValue(values, ["Marital Status", "Marital status"]),
    service_feedback: firstValue(values, ["How was the service?", "Service Feedback", "Service feedback", "Feedback"]),
    nsppdian: firstValue(values, ["Are you an NSPPDian?", "NSPPDian"]),
    next_sunday: firstValue(values, ["Will you be around next Sunday?", "Next Sunday", "Next sunday"]),
    membership_interest: firstValue(values, ["Would you like to be a Streams of Joy Johannesburg member?", "Membership Interest", "Membership interest"]),
    whatsapp_group: firstValue(values, ["Would you like to be added to our church WhatsApp group?", "WhatsApp Group", "Whatsapp Group", "WhatsApp group"]),
    prayer_points: firstValue(values, [
      "Do you have prayer points that you would like our prayer team to pray for? If so, you can list them below.",
      "Prayer Points",
      "Prayer points",
      "Prayer Requests",
      "Prayer Request",
    ]),
    invite: firstValue(values, ["Do you want to invite someone to church?", "Invite"]),
    invite_details: firstValue(values, [
      "If yes on the above question you can insert their name(s) and cellphone number(s). If unanswered no please ignore",
      "Invite Details",
      "Invite details",
    ]),
    secret: PropertiesService.getScriptProperties().getProperty("FORM_WEBHOOK_SECRET")
  };

  var response = UrlFetchApp.fetch("https://sojjdatabasesoftware.netlify.app/.netlify/functions/form-intake", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    headers: {
      "x-form-secret": PropertiesService.getScriptProperties().getProperty("FORM_WEBHOOK_SECRET")
    },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) throw new Error("Visitor sync failed: " + response.getContentText());
}

function firstValue(namedValues, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var value = namedValues[candidates[i]];
    if (value && value[0]) {
      return value[0];
    }
  }
  return "";
}
