"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ProjectType = Database["public"]["Enums"]["project_type"];

export interface CreateProjectState {
  error?: string;
}

function dateOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function createProject(_prevState: CreateProjectState, formData: FormData): Promise<CreateProjectState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile || (profile.role !== "ima_admin" && profile.role !== "ima_producer")) {
    return { error: "Only an IMA Admin or Producer can create a project." };
  }

  const type = String(formData.get("type") ?? "") as ProjectType;
  const name = String(formData.get("name") ?? "").trim();
  const jobNumber = String(formData.get("jobNumber") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const studioOrganisationId = String(formData.get("studioOrganisationId") ?? "") || null;
  const campaignMode = String(formData.get("campaignMode") ?? "existing");
  const newCampaignName = String(formData.get("newCampaignName") ?? "").trim();
  const newCampaignOrganisationId = String(formData.get("newCampaignOrganisationId") ?? "");

  if ((type !== "standard_radio" && type !== "prams") || !name || !jobNumber) {
    return { error: "Fill in the project type, name, and job number." };
  }

  let campaignId = String(formData.get("campaignId") ?? "");
  if (campaignMode === "new") {
    if (!newCampaignName || !newCampaignOrganisationId) {
      return { error: "Name the new campaign and pick which client it's for." };
    }
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({ name: newCampaignName, organisation_id: newCampaignOrganisationId })
      .select("id")
      .single();
    if (campaignError || !campaign) return { error: "Couldn't create the campaign." };
    campaignId = campaign.id;
  }
  if (!campaignId) return { error: "Pick a campaign, or create a new one." };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      type,
      campaign_id: campaignId,
      name,
      job_number: jobNumber,
      description,
      owner_user_id: profile.id,
      studio_organisation_id: studioOrganisationId,
      recording_deadline: dateOrNull(formData, "recordingDeadline"),
      internal_review_deadline: dateOrNull(formData, "internalReviewDeadline"),
      client_review_deadline: dateOrNull(formData, "clientReviewDeadline"),
      live_date: dateOrNull(formData, "liveDate"),
    })
    .select("id")
    .single();

  if (projectError || !project) {
    if (projectError?.code === "23505") return { error: "That job number is already in use." };
    return { error: "Couldn't create the project." };
  }

  if (type === "prams") {
    await supabase.from("prams_updates").insert({ project_id: project.id, update_label: name });
  }

  revalidatePath("/projects");
  revalidatePath("/");
  redirect(`/projects/${project.id}`);
}
