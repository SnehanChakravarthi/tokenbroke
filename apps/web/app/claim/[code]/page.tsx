import { BRAND } from "@tokenbroke/shared";
import { headers } from "next/headers";
import { claimIp, getClaimPreview, mintClaimFormToken } from "@/src/lib/claim";

export const dynamic = "force-dynamic";

export default async function ClaimPage({ params }: PageProps<"/claim/[code]">) {
  const { code } = await params;
  const secret = process.env.CLAIM_SECRET;
  const preview = secret ? await getClaimPreview(code, { ip: claimIp(await headers()) }) : null;
  if (!preview || !secret) {
    return (
      <main>
        <h1>Claim code unavailable</h1>
        <p>Run {BRAND.cliCommand} again for a fresh code.</p>
      </main>
    );
  }
  return (
    <main>
      <h1>Claim {preview.anonymousName}</h1>
      <p>This attaches your public GitHub profile to this row.</p>
      <ul>
        {preview.tools.map((tool) => (
          <li key={tool.tool}>
            {tool.tool}: {tool.remainingPercent?.toFixed(1) ?? "unknown"}% remaining
          </li>
        ))}
      </ul>
      <form method="post" action="/api/claim/start">
        <input type="hidden" name="code" value={code} />
        <input
          type="hidden"
          name="formToken"
          value={mintClaimFormToken(code, secret, new Date())}
        />
        <label>
          X handle (optional)
          <input name="xHandle" maxLength={16} autoComplete="off" placeholder="@handle" />
        </label>
        <button type="submit">Claim with GitHub</button>
      </form>
    </main>
  );
}
