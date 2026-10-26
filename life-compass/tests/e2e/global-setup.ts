import { USERS, ensureUser, wipeUser } from "../helpers/local";

export default async function globalSetup() {
  for (const u of Object.values(USERS)) {
    const id = await ensureUser(u.email, u.password);
    await wipeUser(id);
  }
}
