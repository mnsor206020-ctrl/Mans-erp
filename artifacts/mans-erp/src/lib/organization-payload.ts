export type OrganizationFormPayload = {
  nameEn: string;
  nameAr: string;
  type: string;
  registrationNumber?: string;
  email?: string;
  phone?: string;
  city?: string;
};

export function buildOrganizationPayload(data: OrganizationFormPayload): OrganizationFormPayload {
  const { email, ...fields } = data;
  const normalizedEmail = email?.trim();

  return normalizedEmail ? { ...fields, email: normalizedEmail } : fields;
}
