const JSON_HEADERS = {
  "Content-Type": "application/json",
};

async function parseJsonResponse(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

export async function fetchStations() {
  const response = await fetch("/api/stations");
  return parseJsonResponse(response);
}

export async function fetchRecommend(params) {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/recommend?${query.toString()}`);
  return parseJsonResponse(response);
}

export async function fetchLandmarks() {
  const response = await fetch("/api/landmarks");
  return parseJsonResponse(response);
}

export async function updatePrice(payload) {
  const response = await fetch("/api/update-price", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}
