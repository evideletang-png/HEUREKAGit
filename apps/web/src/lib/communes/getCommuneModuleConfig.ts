import { COMMUNE_MODULES, DEFAULT_COMMUNE_MODULE_CONFIG, type CommuneModuleConfig } from "@/config/communeModules";

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function getCommuneModuleConfig(args?: {
  communeId?: string | null;
  communeName?: string | null;
}): CommuneModuleConfig {
  const id = normalize(args?.communeId);
  const name = normalize(args?.communeName);
  return COMMUNE_MODULES.find((config) => normalize(config.communeId) === id || normalize(config.communeName) === name)
    || DEFAULT_COMMUNE_MODULE_CONFIG;
}
