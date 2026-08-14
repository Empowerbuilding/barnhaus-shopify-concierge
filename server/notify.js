const CRM_URL = "https://ejsnbluvkqocuchifdvp.supabase.co";
const CRM_KEY = process.env.CRM_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqc25ibHV2a3FvY3VjaGlmZHZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjgwMTQ5NywiZXhwIjoyMDgyMzc3NDk3fQ.ZUTMAnnrwi7KPYYhkWL4Gexbn7ClrxOkG_CGWl2Q5X8";

// CRM lead webhook — runs enrichment (Trestle/ATTOM/PDL), lead scoring, and whale scoring
const CRM_WEBHOOK_URL = process.env.CRM_WEBHOOK_URL || "https://crm.empowerbuilding.ai/api/leads/webhook";
const CRM_WEBHOOK_API_KEY = process.env.CRM_WEBHOOK_API_KEY;

// Agent Portal — lead alert cards
const PORTAL_URL = process.env.PORTAL_SUPABASE_URL || "https://xqvnpcxyyxxxydescfzw.supabase.co";
const PORTAL_KEY = process.env.PORTAL_SERVICE_KEY;
const PORTAL_ORG_ID = process.env.PORTAL_ORG_ID || "1c466ccb-ef35-4ba4-bf00-5fcabf20edec";
const LEAD_ALERTS_CHANNEL = process.env.LEAD_ALERTS_CHANNEL || "barnhaus-atlas-lead-alerts";

export async function sendN8nWebhook(s) {
  if (!process.env.N8N_WEBHOOK) return;
  try {
    await fetch(process.env.N8N_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: s.name, email: s.email, phone: s.phone, summary: s.summary, source: "design_concierge" }),
    });
  } catch (err) { console.error("n8n webhook error:", err.message); }
}

export async function writeToCRM(s) {
  try {
    // Handle both s.name (full name) and s.first_name/s.last_name
    let firstName, lastName;
    if (s.first_name || s.last_name) {
      firstName = s.first_name || "";
      lastName = s.last_name || "";
    } else {
      const parts = (s.name || "").trim().split(" ");
      firstName = parts[0] || "";
      lastName = parts.slice(1).join(" ") || "";
    }

    // Build notes from all collected data
    const noteLines = [
      s.summary && `Summary: ${s.summary}`,
      s.location && `Location: ${s.location}${s.lot_size_acres ? ` (${s.lot_size_acres} acres)` : ""}`,
      s.budget && `Budget: ${s.budget}`,
      s.sqft && `Size: ${s.sqft} SF | ${s.stories || "1"} story`,
      (s.bedrooms || s.bathrooms) && `Beds/Baths: ${s.bedrooms || "?"}bd / ${s.bathrooms || "?"}ba`,
      s.style && `Style: ${s.style}`,
      s.garage_cars && `Garage: ${s.garage_cars}-car${s.garage_has_shop ? " + shop" : ""}`,
      s.outdoor_living && `Outdoor: ${s.outdoor_living}`,
      s.timeline && `Timeline: ${s.timeline}`,
      s.land_owned === true ? "Land: Owned" : s.land_owned === false ? "Land: Not yet purchased" : null,
      s.has_builder === false ? "Needs builder referral" : null,
      s.desired_rooms?.length && `Special rooms: ${s.desired_rooms.join(", ")}`,
      s.lifestyle_notes && `Lifestyle: ${s.lifestyle_notes}`,
      s.family_notes && `Family: ${s.family_notes}`,
      s.additional_notes && `Notes: ${s.additional_notes}`,
      s.suggested_plan_names?.length && `Suggested plans: ${s.suggested_plan_names.join(", ")}`,
      `Source: Shopify Store — shopify_store_modification`,
      s.imageUrls?.length && `Inspiration images: ${s.imageUrls.join(", ")}`,
      s.imageAnalyses?.length && `Image analysis:\n${s.imageAnalyses.map((a,i) => `Image ${i+1}: ${a.analysis}`).join("\n")}`,
    ].filter(Boolean).join("\n");

    // Check if contact already exists
    const existing = await fetch(
      `${CRM_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(s.email)}&select=id&limit=1`,
      { headers: { apikey: CRM_KEY, Authorization: `Bearer ${CRM_KEY}` } }
    ).then(r => r.json());

    // Try phone fallback if no email match
    let matchedContact = existing?.[0] || null;
    if (!matchedContact && s.phone) {
      const phone = s.phone.replace(/\D/g, "");
      const byPhone = await fetch(
        `${CRM_URL}/rest/v1/contacts?select=id,lead_source,email&phone=ilike.*${phone.slice(-10)}*&limit=1`,
        { headers: { apikey: CRM_KEY, Authorization: `Bearer ${CRM_KEY}` } }
      ).then(r => r.json());
      if (byPhone?.length > 0) {
        console.log("CRM: matched contact by phone", byPhone[0].id);
        matchedContact = byPhone[0];
      }
    }

    if (matchedContact) {
      // Fetch full existing contact to preserve lead_source
      const existingFull = await fetch(
        `${CRM_URL}/rest/v1/contacts?id=eq.${matchedContact.id}&select=id,lead_source,email`,
        { headers: { apikey: CRM_KEY, Authorization: `Bearer ${CRM_KEY}` } }
      ).then(r => r.json());
      const existingLeadSource = existingFull?.[0]?.lead_source;
      const existingEmail = existingFull?.[0]?.email;
      // Preserve original lead_source; add email if missing
      const updatePayload = { notes: noteLines, lifecycle_stage: "lead", client_type: "consumer", updated_at: new Date().toISOString() };
      if (!existingLeadSource) updatePayload.lead_source = "design_concierge";
      if (!existingEmail && s.email) updatePayload.email = s.email;
      // Update existing contact
      await fetch(`${CRM_URL}/rest/v1/contacts?id=eq.${matchedContact.id}`, {
        method: "PATCH",
        headers: { apikey: CRM_KEY, Authorization: `Bearer ${CRM_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(updatePayload),
      });
      console.log("CRM: updated existing contact", matchedContact.id);
      if (noteLines) await insertCRMNote(matchedContact.id, noteLines);
      return matchedContact.id;
    } else {
      // Route new leads through the CRM lead webhook so enrichment
      // (Trestle → ATTOM → PDL → whale score), lead scoring, and the
      // modifications-deal logic all fire. Falls back to direct insert on failure.
      if (CRM_WEBHOOK_API_KEY) {
        try {
          const whRes = await fetch(CRM_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": CRM_WEBHOOK_API_KEY },
            body: JSON.stringify({
              first_name: firstName || "Unknown",
              last_name: lastName || "Unknown",
              email: s.email,
              phone: s.phone || undefined,
              source: "shopify_store_modification",
              metadata: {
                plan_handle: s.productHandle || null,
                summary: s.summary || null,
              },
            }),
          });
          const whData = await whRes.json();
          if (whData?.success && whData.contact_id) {
            // Replace the webhook's generic notes with the full interview notes
            await fetch(`${CRM_URL}/rest/v1/contacts?id=eq.${whData.contact_id}`, {
              method: "PATCH",
              headers: { apikey: CRM_KEY, Authorization: `Bearer ${CRM_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
              body: JSON.stringify({ notes: noteLines, lifecycle_stage: "lead", client_type: "consumer", updated_at: new Date().toISOString() }),
            });
            if (noteLines) await insertCRMNote(whData.contact_id, noteLines);
            console.log("CRM: created contact via lead webhook (enrichment queued)", whData.contact_id);
            return whData.contact_id;
          }
          console.error("CRM lead webhook non-success, falling back to direct insert:", JSON.stringify(whData));
        } catch (whErr) {
          console.error("CRM lead webhook error, falling back to direct insert:", whErr.message);
        }
      }
      // Create new contact (direct insert fallback)
      const res = await fetch(`${CRM_URL}/rest/v1/contacts`, {
        method: "POST",
        headers: { apikey: CRM_KEY, Authorization: `Bearer ${CRM_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: s.email,
          phone: s.phone || null,
          lead_source: "shopify_store_modification",
          lifecycle_stage: "lead",
          client_type: "consumer",
          notes: noteLines,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      const created = await res.json();
      if (!Array.isArray(created)) console.error("CRM insert error:", JSON.stringify(created));
      const contactId = created?.[0]?.id;
      console.log("CRM: created contact", contactId);
      if (contactId && noteLines) {
        await insertCRMNote(contactId, noteLines);
      }
      return contactId;
    }
  } catch (err) { console.error("CRM write error:", err.message); return null; }
}

// Trigger the standard new-lead SMS flow (n8n Outbound SMS - New Lead).
// The n8n workflow has a dedup guard (skips contacts with any prior sms_sent),
// routes shopify sources to Shannon as owner, and posts to her SMS channel.
export async function triggerLeadSMS(s, contactId) {
  if (!s.phone || !s.email) return;
  try {
    let firstName, lastName;
    if (s.first_name || s.last_name) {
      firstName = s.first_name || "";
      lastName = s.last_name || "";
    } else {
      const parts = (s.name || "").trim().split(" ");
      firstName = parts[0] || "there";
      lastName = parts.slice(1).join(" ") || "";
    }
    const planTitle = (s.suggested_plan_names?.[0] || s.productHandle || "").split("|")[0].trim() || null;
    await fetch("https://n8n.empowerbuilding.ai/webhook/new-lead-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email: s.email,
        phone: s.phone,
        source: "shopify_store_modification",
        contact_id: contactId || null,
        metadata: { planTitle },
      }),
    });
    console.log("Lead SMS webhook triggered for", s.email);
  } catch (err) { console.error("Lead SMS trigger error:", err.message); }
}

// Post a lead card to the Agent Portal lead-alerts channel (barnhaus-atlas-lead-alerts)
export async function notifyLeadAlerts(s) {
  if (!PORTAL_KEY) {
    console.error("PORTAL_SERVICE_KEY not set — skipping portal lead alert");
    return;
  }
  try {
    const name = s.name || `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Unknown";
    const plan = (s.suggested_plan_names?.[0] || s.productHandle || "").toString().trim();
    const lines = [
      "🛍️ **New Shopify Modification Request**",
      `**Name:** ${name}`,
      `**Email:** ${s.email || "—"}`,
      `**Phone:** ${s.phone || "—"}`,
      plan && `**Plan:** ${plan}`,
      s.location && `**Location:** ${s.location}`,
      s.budget && `**Budget:** ${s.budget}`,
      s.timeline && `**Timeline:** ${s.timeline}`,
      s.summary && `\n**What they want:** ${s.summary}`,
    ].filter(Boolean).join("\n");
    const res = await fetch(`${PORTAL_URL}/rest/v1/portal_messages`, {
      method: "POST",
      headers: { apikey: PORTAL_KEY, Authorization: `Bearer ${PORTAL_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        channel_id: LEAD_ALERTS_CHANNEL,
        org_id: PORTAL_ORG_ID,
        sender_type: "agent",
        sender_name: "Atlas",
        content: lines.slice(0, 3900),
        processed: true,
      }),
    });
    if (!res.ok) {
      console.error("Portal lead alert HTTP error:", res.status, await res.text());
      return;
    }
    console.log("Portal lead alert posted — barnhaus-atlas-lead-alerts");
  } catch (err) { console.error("Portal lead alert error:", err.message); }
}

// Log a form_submit activity so the CRM contact page (and any audits) show this touchpoint
export async function logFormSubmitActivity(contactId, s) {
  if (!contactId) return;
  try {
    await fetch(`${CRM_URL}/rest/v1/activities`, {
      method: "POST",
      headers: { apikey: CRM_KEY, Authorization: `Bearer ${CRM_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        contact_id: contactId,
        activity_type: "form_submit",
        title: "Submitted Shopify Modification Request form",
        metadata: {
          source: "shopify_store_modification",
          plan_handle: s.productHandle || null,
          summary: s.summary || null,
        },
        created_at: new Date().toISOString(),
      }),
    });
    console.log("form_submit activity logged for contact", contactId);
  } catch (err) { console.error("Activity log error:", err.message); }
}

async function insertCRMNote(contactId, content) {
  try {
    await fetch(`${CRM_URL}/rest/v1/notes`, {
      method: "POST",
      headers: { apikey: CRM_KEY, Authorization: `Bearer ${CRM_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        contact_id: contactId,
        content: content,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (err) { console.error("CRM note insert error:", err.message); }
}

function val(v) { return v && v !== "null" && v !== "undefined" ? v : null; }

export async function notifyVanessa(s) {
  // If this came from a Shopify product page, route to Zena's #concierge-chats instead
  if (s.productHandle) {
    await notifyZena(s);
    return;
  }

  const token = process.env.VANESSA_DISCORD_TOKEN;
  const channel = process.env.VANESSA_LEAD_ALERTS_CHANNEL;
  if (!token || !channel || !s.email) return;
  try {
    const name = s.name || "Unknown";
    const email = s.email || "—";
    const phone = s.phone || "—";
    const location = s.location || s.property_address || "—";
    const budget = s.budget || s.construction_budget || "—";
    const sqft = s.sqft || s.living || "—";
    const style = s.style || s.aesthetic_style || "—";
    const summary = s.summary || null;

    const msg = [
      `🛍️ **New Shopify Modification Request — Follow Up Now**`,
      ``,
      `**Name:** ${name}`,
      `**Email:** ${email}`,
      `**Phone:** ${phone}`,
      `**Location:** ${location}`,
      `**Budget:** ${budget}`,
      sqft !== "—" ? `**Size:** ${sqft} SF` : null,
      style !== "—" ? `**Style:** ${style}` : null,
      summary ? `\n**Summary:** ${summary}` : null,
      ``,
      `📧 Send a personalized follow-up email within the next hour.`,
    ].filter(v => v !== null).join("\n");

    await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bot ${token}`, "Content-Type": "application/json", "User-Agent": "DiscordBot (barnhaus, 1.0)" },
      body: JSON.stringify({ content: msg.slice(0, 1900) }),
    });
  } catch (err) { console.error("Vanessa notify error:", err.message); }

  // Also post to Shopify sales channel (custom design clients only)
  const shopifyChannel = "1499096351370379496";
  try {
    const shopifyMsg = [
      `🛍️ **Shopify Modification Lead**`,
      ``,
      `**Name:** ${s.name || "Unknown"}`,
      `**Email:** ${s.email || "—"}`,
      `**Phone:** ${s.phone || "—"}`,
      s.summary ? `
**What they want:** ${s.summary}` : null,
    ].filter(v => v !== null).join("\n");

    await fetch(`https://discord.com/api/v10/channels/${shopifyChannel}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bot ${token}`, "Content-Type": "application/json", "User-Agent": "DiscordBot (barnhaus, 1.0)" },
      body: JSON.stringify({ content: shopifyMsg.slice(0, 1900) }),
    });
  } catch (err) { console.error("Shopify channel notify error:", err.message); }
}

// Notify Zena's #concierge-chats for Shopify-originated sessions
async function notifyZena(s) {
  const token = process.env.ZENA_DISCORD_TOKEN;
  const channel = "1508305664223609024"; // #concierge-chats
  if (!token) {
    console.error("ZENA_DISCORD_TOKEN not set — cannot route Shopify concierge to Zena");
    return;
  }
  try {
    const name = s.name || `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Unknown";
    const plan = s.productHandle ? `Plan: ${s.productHandle}` : "";
    const summary = s.summary || "No summary";
    const mods = s.suggested_plan_names?.length ? `Plans discussed: ${s.suggested_plan_names.join(", ")}` : "";

    const lines = [
      `🛍️ **Shopify Concierge Complete — ${name}**`,
      plan && `📦 ${plan}`,
      `✉️ ${s.email || "—"} | 📞 ${s.phone || "—"}`,
      s.location && `📍 ${s.location}${s.lot_size_acres ? ` (${s.lot_size_acres} acres)` : ""}`,
      s.budget && `💰 Budget: ${s.budget}`,
      s.sqft && `📐 ${s.sqft} SF | ${s.stories || "1"} story`,
      s.timeline && `🗓️ Timeline: ${s.timeline}`,
      mods && `\n🏡 ${mods}`,
      `\n📋 **Summary:** ${summary}`,
    ].filter(Boolean).join("\n");

    await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.slice(0, 1900) }),
    });
    console.log("Zena notified — concierge-chats");
  } catch (err) { console.error("Zena notify error:", err.message); }
}

export async function sendDiscordNotification(s, partial = false) {
  if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CHANNEL) return;
  try {
    const tag = partial ? "⚡ **Partial Lead — Contact Captured**" : "🛍️ **New Shopify Modification Request**";
    const sections = [];

    const contact = [`**Client:** ${val(s.name) || "Unknown"}`, val(s.email) && `**Email:** ${s.email}`, val(s.phone) && `**Phone:** ${s.phone}`].filter(Boolean).join("\n");
    sections.push(contact);

    if (!partial && val(s.summary)) sections.push(`**Summary:** ${s.summary}`);

    const design = [
      val(s.sqft) && `• Size: ${s.sqft} SF${val(s.stories) ? ` | ${s.stories} story` : ""}`,
      (val(s.bedrooms) || val(s.bathrooms)) && `• Beds/Baths: ${val(s.bedrooms) || "?"}bd / ${val(s.bathrooms) || "?"}ba`,
      val(s.style) && `• Style: ${s.style}`,
      val(s.ceiling_height) && `• Ceilings: ${s.ceiling_height}ft${s.great_room_vaulted ? " (vaulted)" : ""}`,
      !val(s.ceiling_height) && s.great_room_vaulted && `• Ceilings: Vaulted great room`,
      val(s.roof_style) && `• Roof: ${s.roof_style}`,
    ].filter(Boolean);
    if (design.length) sections.push("📐 **Design**\n" + design.join("\n"));

    const garage = [
      val(s.garage_cars) && `• Garage: ${s.garage_cars}-car${s.garage_has_shop ? " + shop" : ""}${s.garage_has_rv ? " + RV" : ""}`,
      val(s.outdoor_living) && `• Outdoor: ${s.outdoor_living}`,
      val(s.porch_sf_estimate) && `• Porch: ~${s.porch_sf_estimate} SF`,
    ].filter(Boolean);
    if (garage.length) sections.push("🚗 **Garage & Outdoor**\n" + garage.join("\n"));

    const location = [
      val(s.location) && `• ${s.location}`,
      val(s.lot_size_acres) && `• ${s.lot_size_acres} acres`,
      val(s.view_direction) && `• View: ${s.view_direction}`,
      val(s.street_facing) && `• Street: ${s.street_facing}`,
    ].filter(Boolean);
    if (location.length) sections.push("🌎 **Location**\n" + location.join("\n"));

    const project = [
      val(s.budget) && `• Budget: ${s.budget}`,
      val(s.timeline) && `• Timeline: ${s.timeline}`,
      s.land_owned === true && `• Land: Owned`,
      s.land_owned === false && `• Land: Not yet purchased`,
      s.has_builder === false && `• Builder: Needs referral`,
      s.desired_rooms?.length && `• Special rooms: ${s.desired_rooms.join(", ")}`,
      val(s.lifestyle_notes) && `• Lifestyle: ${s.lifestyle_notes}`,
      val(s.additional_notes) && `• Notes: ${s.additional_notes}`,
    ].filter(Boolean);
    if (project.length) sections.push("📋 **Project**\n" + project.join("\n"));

    // Floor plans shown
    if (!partial && s.suggested_plan_names?.length) {
      sections.push(`🏡 **Plans Shown**\n${s.suggested_plan_names.map(n => `• ${n}`).join("\n")}`);
    }

    if (s.imageUrls?.length) {
      const imgLines = [`📷 **Images (${s.imageUrls.length})**`];
      s.imageUrls.forEach((url, i) => {
        imgLines.push(`• ${url}`);
        if (s.imageAnalyses?.[i]) imgLines.push(`  ↳ ${s.imageAnalyses[i].analysis.split("\n")[0]}`);
      });
      sections.push(imgLines.join("\n"));
    }

    const fullContent = tag + "\n\n" + sections.join("\n\n");

    // Split into chunks of max 1900 chars to stay under Discord's 2000 char limit
    const chunks = [];
    let remaining = fullContent;
    while (remaining.length > 0) {
      if (remaining.length <= 1900) {
        chunks.push(remaining);
        break;
      }
      // Find last newline before 1900 chars
      let splitAt = remaining.lastIndexOf("\n", 1900);
      if (splitAt === -1) splitAt = 1900;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    let firstMsgId = null;
    for (const chunk of chunks) {
      const res = await fetch(`https://discord.com/api/v10/channels/${process.env.DISCORD_CHANNEL}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json", "User-Agent": "DiscordBot (barnhaus, 1.0)" },
        body: JSON.stringify({ content: chunk }),
      });
      const msg = await res.json();
      if (!firstMsgId) firstMsgId = msg.id || null;
    }
    return firstMsgId;
  } catch (err) { console.error("Discord notification error:", err.message); return null; }
}

export async function deleteDiscordMessage(messageId) {
  if (!messageId || !process.env.DISCORD_TOKEN || !process.env.DISCORD_CHANNEL) return;
  try {
    await fetch(`https://discord.com/api/v10/channels/${process.env.DISCORD_CHANNEL}/messages/${messageId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bot ${process.env.DISCORD_TOKEN}`, "User-Agent": "DiscordBot (barnhaus, 1.0)" },
    });
  } catch (err) { console.error("Discord delete error:", err.message); }
}

export async function logModification(s, contactId) {
  // Only log if there's actual modification content (Shopify modify flow)
  const modContent = s.additional_notes || s.summary;
  if (!modContent || !s.productHandle) return;
  try {
    await fetch(`${CRM_URL}/rest/v1/modifications`, {
      method: "POST",
      headers: { apikey: CRM_KEY, Authorization: `Bearer ${CRM_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        contact_id: contactId,
        plan_handle: s.productHandle,
        plan_name: s.suggested_plan_names?.[0] || s.productHandle,
        mod_list: modContent,
        status: "new",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    console.log("Modification logged for contact", contactId);
  } catch (err) { console.error("Modification log error:", err.message); }
}
