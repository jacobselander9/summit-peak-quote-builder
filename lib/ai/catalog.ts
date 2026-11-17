// The values the model is allowed to use, built from /data so they can never
// drift from the price book.
import type { Dataset } from "@/lib/data";

export type Catalog = {
  /** Main jobs that can be quoted: installs that have tiers + all service jobs. */
  mainJobCodes: string[];
  installJobCodes: string[];
  serviceJobCodes: string[];
  addonJobCodes: string[];
  /** Install job code -> valid size keys. */
  sizesByJob: Record<string, string[]>;
  allSizes: string[];
  /** Install job code -> SKUs already included in its Good/Better/Best packages. */
  packageSkusByJob: Record<string, string[]>;
  skus: string[];
  cities: string[];
};

export function buildCatalog(data: Dataset): Catalog {
  const jobs = Object.values(data.laborJobs);
  // Only installs with Good/Better/Best packages can be priced.
  const installJobCodes = jobs
    .filter((j) => j.jobType === "install" && data.tiers[j.jobCode])
    .map((j) => j.jobCode);
  const serviceJobCodes = jobs.filter((j) => j.jobType === "service").map((j) => j.jobCode);
  const addonJobCodes = jobs.filter((j) => j.jobType === "addon").map((j) => j.jobCode);

  const sizesByJob: Record<string, string[]> = {};
  const packageSkusByJob: Record<string, string[]> = {};
  for (const code of installJobCodes) {
    sizesByJob[code] = Object.keys(data.tiers[code]);
    const skus = new Set<string>();
    for (const size of Object.values(data.tiers[code])) {
      for (const tier of Object.values(size.tiers)) tier.items.forEach((i) => skus.add(i.sku));
    }
    packageSkusByJob[code] = [...skus];
  }

  return {
    mainJobCodes: [...installJobCodes, ...serviceJobCodes],
    installJobCodes,
    serviceJobCodes,
    addonJobCodes,
    sizesByJob,
    allSizes: [...new Set(Object.values(sizesByJob).flat())],
    packageSkusByJob,
    skus: Object.keys(data.priceBook),
    cities: [...data.rules.service_area],
  };
}
