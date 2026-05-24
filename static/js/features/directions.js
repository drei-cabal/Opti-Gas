// Opens Google Maps navigation for the selected station and user origin.
export function openDirections(station, userLocation) {
  if (!station || !userLocation) {
    return;
  }
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${userLocation.lat},${userLocation.lng}`);
  url.searchParams.set("destination", `${station.lat},${station.lng}`);
  url.searchParams.set("travelmode", "driving");
  window.open(url.toString(), "_blank", "noopener");
}
