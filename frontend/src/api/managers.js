import { api } from "./client"

/**
 * Manager directory — owners browse this when picking a manager.
 *
 * Each entry returned by `listManagers()` has:
 *   - manager_id, headline, bio, years_experience
 *   - rating (0..5), review_count, response_time_hours, on_time_rate
 *   - specialties[], languages[], service_area, starting_fee_percent
 *   - user            (User profile, password stripped)
 *   - active_properties, active_units, active_leases, open_tickets
 *     (computed live from the rest of the db)
 */
export const listManagers = () => api.get("/managers")
export const getManager = (id) => api.get(`/managers/${id}`)
