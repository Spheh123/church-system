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
    return json(403, { error: "Only admins can reset user passwords" });
  }

  const payload = JSON.parse(event.body || "{}");
  if (!payload.userId) {
    return json(400, { error: "userId is required" });
  }

  const password = randomPassword();

  const updateResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${payload.userId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      password,
      user_metadata: {
        password_managed_by_admin: true,
      },
    }),
  });

  const result = await updateResponse.json().catch(() => ({}));
  if (!updateResponse.ok) {
    return json(400, { error: result.msg || result.message || "Could not reset password" });
  }

  return json(200, {
    ok: true,
    password,
  });
};
