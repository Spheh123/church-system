function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, x-form-secret",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function pick(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }

  return null;
}

function normalizePerson(source) {
  return {
    full_name: pick(source, ["full_name", "fullName", "name", "full name", "full name and surname"]),
    email: pick(source, ["email", "email address"]),
    phone: pick(source, [
      "phone",
      "cellphone",
      "cellphone_number",
      "cellphone number",
      "cell phone number",
      "cell phone number ",
      "mobile number",
      "phone number",
    ]),
    area_of_residence: pick(source, [
      "area_of_residence",
      "which area do you reside in (e.g., midrand, tembisa, morningside)?",
      "area of residence",
      "residence",
      "place of residence",
      "residential area",
      "where do you live",
    ]),
    dob: pick(source, [
      "dob",
      "date_of_birth",
      "date of birth",
      "please provide your date of birth so we can celebrate your birthday with you!",
    ]),
    gender: pick(source, ["gender"]),
    occupation: pick(source, ["occupation"]),
    marital_status: pick(source, ["marital_status", "marital status", "marital"]),
    service_feedback: pick(source, ["service_feedback", "service feedback", "feedback", "how was the service?"]),
    nsppdian: pick(source, ["nsppdian", "are you an nsppdian?"]),
    next_sunday: pick(source, ["next_sunday", "next sunday", "will you come next sunday", "will you be around next sunday?"]),
    membership_interest: pick(source, [
      "membership_interest",
      "membership interest",
      "interested in membership",
      "would you like to be a streams of joy johannesburg member?",
    ]),
    whatsapp_group: pick(source, [
      "whatsapp_group",
      "whatsapp group",
      "join whatsapp group",
      "would you like to be added to our church whatsapp group?",
    ]),
    prayer_points: pick(source, [
      "prayer_points",
      "prayer points",
      "prayer request",
      "prayer requests",
      "do you have prayer points that you would like our prayer team to pray for? if so, you can list them below.",
    ]),
    invite: pick(source, ["invite", "do you want to invite someone to church?"]),
    invite_details: pick(source, [
      "invite_details",
      "invite details",
      "if yes on the above question you can insert their name(s) and cellphone number(s). if unanswered no please ignore",
    ]),
  };
}

async function insertPerson(person, env) {
  const primaryPayload = {
    ...person,
    area: person.area_of_residence,
  };

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/people`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(primaryPayload),
  });

  const data = await response.json();

  if (response.ok) {
    return {
      ok: true,
      data,
    };
  }

  const message = data?.message || "";
  const missingAreaOfResidence = message.includes("area_of_residence");

  if (!missingAreaOfResidence) {
    return {
      ok: false,
      data,
    };
  }

  const fallbackPayload = { ...person };
  delete fallbackPayload.area_of_residence;
  fallbackPayload.area = person.area_of_residence;

  const fallbackResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/people`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(fallbackPayload),
  });

  return {
    ok: fallbackResponse.ok,
    data: await fallbackResponse.json(),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const payload = JSON.parse(event.body || "{}");

  if (payload.mode === "report_export") {
    if (!process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
      return json(400, { error: "GOOGLE_SHEETS_WEBHOOK_URL is not configured" });
    }

    const response = await fetch(process.env.GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return json(response.ok ? 200 : 400, await response.json().catch(() => ({ ok: response.ok })));
  }

  const expectedSecret = process.env.FORM_WEBHOOK_SECRET;
  const suppliedSecret = event.headers["x-form-secret"] || payload.secret;
  const isPublicBrowserSubmission = payload.source === "public_form";

  if (expectedSecret && !isPublicBrowserSubmission && suppliedSecret !== expectedSecret) {
    return json(401, { error: "Invalid form secret" });
  }

  const person = normalizePerson(payload);
  if (!person.full_name) {
    return json(400, { error: "full_name is required" });
  }

  const result = await insertPerson(person, process.env);
  if (!result.ok) {
    return json(400, { error: result.data?.message || "Could not insert person" });
  }

  return json(200, { ok: true, person: result.data?.[0] ?? null });
};
