export type GenerationProject = { id: string };
export type GenerationSourceVersion = { project_id: string | null };

export function resolveGenerationProjectId(
  currentProjectId: string | undefined,
  requestedProjectId: string | undefined,
  projects: readonly GenerationProject[],
) {
  if (currentProjectId) return currentProjectId;
  if (requestedProjectId && projects.some((project) => project.id === requestedProjectId))
    return requestedProjectId;
  return projects[0]?.id || "";
}

export function filterGenerationSourceVersions<Version extends GenerationSourceVersion>(
  versions: readonly Version[],
  projectId: string,
) {
  return versions.filter((version) => version.project_id === projectId);
}
