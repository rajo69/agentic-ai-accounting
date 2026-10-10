"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { UserPlus, Trash2, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/eyebrow";
import { StatusChip } from "@/components/ui/status-chip";
import {
  getMe,
  listTeam,
  inviteMember,
  removeMember,
  type Me,
  type TeamMember,
} from "@/lib/api";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Skeleton } from "@/components/app/skeleton";
import { uiTransition } from "@/lib/motion";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function TeamPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [inviting, setInviting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, teamRes] = await Promise.all([getMe(), listTeam()]);
      setMe(meRes);
      setMembers(teamRes);
    } catch (e) {
      toast.error(`Failed to load team: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const isOwner = me?.role === "owner";

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !name.trim()) {
      toast.error("Email and name are required");
      return;
    }
    setInviting(true);
    const tid = toast.loading("Sending invitation…");
    try {
      await inviteMember({ email: email.trim(), name: name.trim() });
      toast.success(`Invitation sent to ${email}`, { id: tid });
      setEmail("");
      setName("");
      setShowInvite(false);
      await refresh();
    } catch (e) {
      toast.error(`Invite failed: ${e instanceof Error ? e.message : String(e)}`, { id: tid });
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(member: TeamMember) {
    if (!confirm(`Remove ${member.name} from the team?`)) return;
    const tid = toast.loading("Removing member…");
    try {
      await removeMember(member.id);
      toast.success(`${member.name} removed`, { id: tid });
      await refresh();
    } catch (e) {
      toast.error(`Remove failed: ${e instanceof Error ? e.message : String(e)}`, { id: tid });
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={uiTransition}
      className="max-w-3xl space-y-6"
    >
      {/* Header */}
      <PageHeader
        title="Team"
        meta={me?.org_name ? `${me.org_name} · ${members.length} ${members.length === 1 ? "member" : "members"}` : "Who can review this organisation"}
      >
        {isOwner && !showInvite && (
          <Button onClick={() => setShowInvite(true)}>
            <UserPlus />
            Invite member
          </Button>
        )}
      </PageHeader>

      {/* Invite form */}
      {showInvite && isOwner && (
        <form
          onSubmit={handleInvite}
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
        >
          <Eyebrow className="text-muted-foreground">Invite</Eyebrow>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invite-name" className="text-small text-muted-foreground">Name</label>
              <Input
                id="invite-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invite-email" className="text-small text-muted-foreground">Email</label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@firm.co.uk"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowInvite(false); setEmail(""); setName(""); }}
              disabled={inviting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={inviting}>
              {inviting ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {inviting ? "Sending" : "Send invite"}
            </Button>
          </div>
        </form>
      )}

      {/* Member list */}
      <div className="flex flex-col gap-3">
        <Eyebrow className="text-muted-foreground">Members</Eyebrow>
        {loading ? (
          <ul className="overflow-hidden rounded-lg border border-border bg-surface">
            {[...Array(2)].map((_, i) => (
              <li key={i} className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        ) : members.length === 0 ? (
          <EmptyState icon={<Users />} title="No team members yet." />
        ) : (
          <ul className="overflow-hidden rounded-lg border border-border bg-surface">
            {members.map((m) => {
              const isSelf = me?.user_id === m.id;
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 font-mono text-xs text-muted-foreground"
                    >
                      {initials(m.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                        <StatusChip tone={m.role === "owner" ? "primary" : "muted"} dot={false}>
                          {m.role === "owner" ? "Owner" : "Member"}
                        </StatusChip>
                        {isSelf && <span className="font-mono text-xs text-muted-foreground">you</span>}
                      </div>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {m.email} · joined {fmtDate(m.created_at)}
                      </p>
                    </div>
                  </div>
                  {isOwner && !isSelf && m.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(m)}
                      className="shrink-0 text-danger hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Help text for non-owners */}
      {!isOwner && !loading && (
        <p className="text-small text-muted-foreground">
          Only owners can invite or remove members. Ask the account owner if you need to add someone.
        </p>
      )}
    </motion.div>
  );
}
