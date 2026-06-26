export async function searchPlaces(query) {
  if (!query?.trim()) return [];

  const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Geocoding failed (${res.status})`);
  }

  return data.results || [];
}

export async function reverseGeocode(lat, lng) {
  const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Reverse geocoding failed (${res.status})`);
  }

  return data.results || [];
}
