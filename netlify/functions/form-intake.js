const { api, parseBody, handler, HttpError } = require('./lib/server');
const { timingSafeEqual } = require('node:crypto');
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


exports.handler = handler(async event => {
  const payload = parseBody(event);
  if (payload.mode === 'report_export') throw new HttpError(400, 'Use the authenticated report endpoint.');
  const expected = process.env.FORM_WEBHOOK_SECRET;
  if (!expected) throw new HttpError(503, 'Form intake is not configured.');
  const supplied = event.headers['x-form-secret'] || payload.secret || '';
  if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new HttpError(401, 'Invalid form secret.');
  const person = normalizePerson(payload);
  if (typeof person.full_name !== 'string' || !person.full_name.trim()) throw new HttpError(400, 'A name is required.');
  for (const [key,value] of Object.entries(person)) {
    if (value !== null && typeof value !== 'string') throw new HttpError(400, 'Invalid field: ' + key);
    if (value?.length > (['prayer_points','service_feedback','invite_details'].includes(key) ? 10000 : 500)) throw new HttpError(400, 'Field is too long: ' + key);
  }
  if (payload.source_id) {
    if (typeof payload.source_id !== 'string' || payload.source_id.length > 250) throw new HttpError(400, 'Invalid source ID.');
    person.source_id = payload.source_id;
  }
  if (payload.timestamp) person.source_timestamp = String(payload.timestamp).slice(0,150);
  const rawDate = payload.createdAt || payload.created_at;
  if (rawDate && !Number.isNaN(new Date(rawDate).getTime())) person.created_at = new Date(rawDate).toISOString();
  const data = await api('/rest/v1/people' + (person.source_id ? '?on_conflict=source_id' : ''), { method: 'POST', prefer: 'return=representation,resolution=ignore-duplicates', body: person });
  return { ok: true, duplicate: !data?.length, person_id: data?.[0]?.id || null };
});
