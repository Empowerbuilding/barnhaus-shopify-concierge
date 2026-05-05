import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function fetchFloorPlans() {
  const { data, error } = await supabase
    .from("website_floor_plans")
    .select("id,title,beds,baths,area,image_url,floor_plan_url,category,tags,style");
  if (error) { console.error("Error fetching floor plans:", error); return []; }
  return data || [];
}

export async function writeSubmission(s) {
  // Parse numeric fields safely
  const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const toInt = (v) => { const n = parseInt(v); return isNaN(n) ? null : n; };

  // Build desired_rooms array from multiple sources
  const desiredRooms = Array.isArray(s.desired_rooms) ? s.desired_rooms : [];

  // Combine outdoor_living + lifestyle + family into additional_requests
  const notes = [
    s.outdoor_living && `Outdoor living: ${s.outdoor_living}`,
    s.lifestyle_notes && `Lifestyle: ${s.lifestyle_notes}`,
    s.family_notes && `Family: ${s.family_notes}`,
    s.garage_has_shop && "Wants shop space",
    s.garage_has_rv && "Needs RV storage",
    s.additional_notes,
  ].filter(Boolean).join(" | ");

  const record = {
    name: s.name || null,
    email: s.email || null,
    phone: s.phone || null,
    property_address: s.location || null,
    construction_budget: s.budget || null,
    stories: s.stories ? String(s.stories) : null,
    living: toNum(s.sqft),
    sqft: toNum(s.sqft),
    bedrooms: toInt(s.bedrooms),
    bathrooms: toNum(s.bathrooms),
    full_baths: toInt(s.full_baths) || toInt(s.bathrooms) || null,
    half_baths: toInt(s.half_baths) || null,
    aesthetic_style: s.style || null,
    garage_cars: toInt(s.garage_cars),
    garage_count: s.garage_cars ? `${s.garage_cars}-car` : null,
    desired_rooms: desiredRooms,
    additional_requests: notes || s.additional_notes || null,
    ceiling_height: toNum(s.ceiling_height),
    great_room_vaulted: s.great_room_vaulted ?? null,
    main_roof_style: s.roof_style || null,
    porch_sf: toNum(s.porch_sf_estimate),
    front_porch_sf: toNum(s.porch_sf_estimate) || null,
    back_porch_sf: toNum(s.porch_sf_estimate) || null,
    lot_size_acres: toNum(s.lot_size_acres),
    street_facing: s.street_facing || null,
    lot_notes: [
      s.view_direction && `View: ${s.view_direction}`,
      s.lot_slope && `Slope: ${s.lot_slope}`,
      s.timeline && `Timeline: ${s.timeline}`,
      s.home_purpose && `Purpose: ${s.home_purpose}`,
      s.has_builder === true ? "Has builder" : s.has_builder === false ? "Needs builder referral" : null,
      s.land_owned === true ? "Owns land" : s.land_owned === false ? "Land not yet purchased" : null,
    ].filter(Boolean).join(" | ") || null,
    inspiration_images: s.imageUrls || [],
    vision_analysis: s.imageAnalyses?.map(a => `[${a.url}] ${a.analysis}`).join("\n\n") || null,
    status: "new",
    submitted_at: new Date().toISOString(),
  };

  console.log("Writing submission:", JSON.stringify(record, null, 2));

  const { data, error } = await supabase
    .from("design_intake_submissions")
    .insert(record)
    .select();

  if (error) { console.error("Supabase write error:", error); throw error; }
  return data;
}
