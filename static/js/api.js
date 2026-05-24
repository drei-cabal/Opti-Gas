const JSON_HEADERS = {
  "Content-Type": "application/json",
};

// Parses API JSON responses and raises backend error messages for failed requests.
async function parseJsonResponse(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

// Loads the full station collection from the Flask API.
export async function fetchStations() {
  const response = await fetch("/api/stations");
  return parseJsonResponse(response);
}

// Requests ranked station recommendations for the current map and filter state.
export async function fetchRecommend(params) {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/recommend?${query.toString()}`);
  return parseJsonResponse(response);
}

// Loads saved landmark options from the Flask API.
export async function fetchLandmarks() {
  const response = await fetch("/api/landmarks");
  return parseJsonResponse(response);
}

// Submits an approved station price update to the backend.
export async function updatePrice(payload) {
  const response = await fetch("/api/update-price", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}
