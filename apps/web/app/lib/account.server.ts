import { redirect } from "react-router";
import type { PublicAuthor } from "@my-micro/shared";
import { apiData } from "./api.server";
import { localHref, requestLocale } from "./i18n";
import { accountDocumentPath, type AccountDocumentPath } from "./document-paths";

export async function requireUser(request: Request, pathname: AccountDocumentPath): Promise<PublicAuthor> {
  const { user } = await apiData<{ user: PublicAuthor | null }>(request, "/api/v1/me");
  if (!user) {
    const returnTo = accountDocumentPath(request.url, pathname);
    throw redirect(localHref(`/login?returnTo=${encodeURIComponent(returnTo)}`, requestLocale(request)));
  }
  return user;
}
