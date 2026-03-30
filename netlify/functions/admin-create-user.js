function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function randomPassword(length = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function verifyUser(token, env) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function queryRole(userId, env) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=*`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  const rows = await response.json();
  return rows?.[0] ?? null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const token = event.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return json(401, { error: "Missing authorization token" });
  }

  const currentUser = await verifyUser(token, process.env);
  if (!currentUser) {
    return json(401, { error: "Invalid session" });
  }

  const currentProfile = await queryRole(currentUser.id, process.env);
  if (!currentProfile || currentProfile.role !== "admin") {
    return json(403, { error: "Only admins can create users" });
  }

  const payload = JSON.parse(event.body || "{}");
  if (!payload.name || !payload.email || !["admin", "pastor", "team"].includes(payload.role)) {
    return json(400, { error: "name, email and role are required" });
  }

  const password = randomPassword();

  const authResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      email: payload.email,
      password,
      email_confirm: true,
      user_metadata: {
        name: payload.name,
        role: payload.role,
      },
    }),
  });

  const authUser = await authResponse.json();
  if (!authResponse.ok) {
    return json(400, { error: authUser.msg || authUser.message || "Could not create auth user" });
  }

  const authUserId = authUser.user?.id || authUser.id;
  if (!authUserId) {
    return json(400, { error: "Auth user was created but the returned id was missing" });
  }

  const insertResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      id: authUserId,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      created_by: currentUser.id,
    }),
  });

  const inserted = await insertResponse.json();
  if (!insertResponse.ok) {
    return json(400, { error: inserted.message || "Could not create user profile" });
  }

  return json(200, {
    user: inserted?.[0] ?? null,
    password,
  });
};
