import { geocodeLocation } from '../services/geocoding_provider.js';

export async function geocode(address) {
  return geocodeLocation(address);
}
