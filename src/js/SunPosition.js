import * as THREE from 'three';

/**
 * Returns a unit vector pointing FROM Earth's center TOWARD the Sun,
 * in Three.js world coordinates where:
 *   +X = longitude 0° (prime meridian)
 *   +Y = north pole
 *   -Z = longitude 90°E  (east goes into -Z by Three.js sphere UV convention)
 *
 * Based on simplified solar position algorithm (accurate to ±1°).
 */
export function getSunDirection() {
  const now = new Date();
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;

  // Day of year (1–365)
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((now - startOfYear) / 86_400_000);

  // Solar declination (axial tilt effect, degrees → radians)
  const declRad = -23.45 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10)) * (Math.PI / 180);

  // Sub-solar longitude (degrees east of prime meridian)
  // At UTC 12:00 the sub-solar point is at 0°E; moves 15°/hour westward.
  const solarLonDeg = (12 - utcHours) * 15;
  const lonRad = solarLonDeg * (Math.PI / 180);

  // Convert to Three.js Cartesian (prime meridian = +X, 90°E = -Z)
  const sunX = Math.cos(declRad) * Math.cos(lonRad);
  const sunY = Math.sin(declRad);
  const sunZ = Math.cos(declRad) * (-Math.sin(lonRad));

  return new THREE.Vector3(sunX, sunY, sunZ).normalize();
}

/**
 * Convert geographic lat/lng to a THREE.Vector3 on a sphere of given radius.
 * Matches the same coordinate convention as getSunDirection().
 */
export function latLngTo3D(lat, lng, radius = 1.0) {
  const latRad = lat * (Math.PI / 180);
  const lngRad = lng * (Math.PI / 180);
  return new THREE.Vector3(
    radius * Math.cos(latRad) * Math.cos(lngRad),
    radius * Math.sin(latRad),
    radius * Math.cos(latRad) * (-Math.sin(lngRad)),
  );
}
