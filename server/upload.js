import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function uploadImage(fileBuffer, mimetype, originalName) {
  const ext = originalName.split(".").pop().toLowerCase() || "jpg";
  const filename = `concierge/${Date.now()}-${randomUUID().slice(0,8)}.${ext}`;

  const { data, error } = await supabase.storage
    .from("inspiration-images")
    .upload(filename, fileBuffer, { contentType: mimetype, upsert: false });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from("inspiration-images")
    .getPublicUrl(filename);

  return urlData.publicUrl;
}

export async function analyzeImage(fileBuffer, mimetype) {
  try {
    const base64 = fileBuffer.toString("base64");

    // Step 1: Classify the image type
    const classifyRes = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 20,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimetype, data: base64 } },
          { type: "text", text: `What type of image is this? Reply with exactly one word: INSPIRATION, FLOORPLAN, SURVEY, or AERIAL.\n- INSPIRATION: a photo of a house exterior, interior, kitchen, living room, or design aesthetic\n- FLOORPLAN: a floor plan drawing, blueprint, sketch, or room layout diagram\n- SURVEY: a land survey, property boundary document, or legal plat map\n- AERIAL: an aerial or satellite photo of land, a lot, or property from above` }
        ]
      }]
    });

    const imageType = classifyRes.content[0]?.text?.trim().toUpperCase() || "INSPIRATION";

    // Step 2: Analyze based on type
    let prompt;
    if (imageType === "FLOORPLAN") {
      prompt = `This is a floor plan uploaded by a prospective homebuilding client. Analyze it in 3-5 sentences covering:
- Overall layout and flow (open concept vs compartmentalized, number of wings or zones)
- Room placement and adjacencies (master location, garage placement, kitchen/living relationship)
- Approximate size and story count if determinable
- Any standout layout features (bonus rooms, split bedrooms, unique shapes, indoor-outdoor connections)
- What the client likely likes about this layout — what design priorities does it reveal?
Be specific and useful for a home designer interpreting client preferences.`;
    } else if (imageType === "SURVEY") {
      prompt = `This is a land survey or property document uploaded by a prospective homebuilding client. Analyze it in 3-5 sentences covering:
- Approximate lot size and shape (rectangular, irregular, narrow, wide)
- Any visible setback lines, easements, or restrictions
- Lot orientation if determinable (which direction faces street)
- Topography notes if any (slopes, drainage, elevations)
- Any features that would affect home placement or design (trees, utilities, access points)
Be specific and useful for a home designer planning a build on this lot.`;
    } else if (imageType === "AERIAL") {
      prompt = `This is an aerial or satellite photo of a property uploaded by a prospective homebuilding client. Analyze it in 3-5 sentences covering:
- Approximate lot size, shape, and terrain visible
- Surrounding context (rural, suburban, wooded, open land, water features)
- Visible topography (flat, sloped, hillside, ridge)
- Any existing structures, trees, or features worth noting
- Street/driveway access and likely orientation of the home
Be specific and useful for a home designer planning a build on this lot.`;
    } else {
      // INSPIRATION (default)
      prompt = `Analyze this inspiration image uploaded by a prospective homebuilding client. Extract design signals in 3-5 sentences covering:
- Architectural style (modern, rustic, industrial, Hill Country, farmhouse, contemporary, etc.)
- Key exterior materials (steel, wood, stone, stucco, brick, etc.) if exterior is shown
- Roof style if visible (gable, shed, flat, hip, metal)
- Interior features if visible (open plan, vaulted ceilings, kitchen style, finishes, beam work)
- Overall vibe and any standout design elements the client is likely drawn to
Be specific and useful for a home designer understanding client taste.`;
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimetype, data: base64 } },
          { type: "text", text: prompt }
        ]
      }]
    });

    const analysis = response.content[0]?.text || null;
    // Prefix with image type so the AI knows what it's reading
    return analysis ? `[${imageType}] ${analysis}` : null;

  } catch (err) {
    console.error("Vision analysis error:", err.message);
    return null;
  }
}
