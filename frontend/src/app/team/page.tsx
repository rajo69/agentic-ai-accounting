"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { UserPlus, Trash2, Crown, User as UserIcon, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getMe,
  listTeam,
  inviteMember,
  removeMember,
  type Me,
  type TeamMember,
} from "@/lib/api";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-3xl space-y-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isOwner
              ? "Manage who can access your organisation."
              : "Members of your organisation."}
          </p>
        </div>
        {isOwner && !showInvite && (
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              onClick={() => setShowInvite(true)}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Invite member
            </Button>
          </motion.div>
        )}
      </div>

      {/* Invite form */}
      {showInvite && isOwner && (
        <motion.form
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleInvite}
          className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@firm.co.uk"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowInvite(false); setEmail(""); setName(""); }}
              disabled={inviting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={inviting}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              <Mail className="w-4 h-4" />
              {inviting ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </motion.form>
      )}

      {/* Member list */}
      <div>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl py-12 text-center">
            <UserIcon className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No team members yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((m) => {
              const isSelf = me?.user_id === m.id;
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl shadow-sm ring-1 ring-slate-100 px-5 py-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                      {m.role === "owner"
                        ? <Crown className="w-4 h-4 text-indigo-600" />
                        : <UserIcon className="w-4 h-4 text-slate-500" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 text-sm truncate">{m.name}</p>
                        {isSelf && (
                          <span className="text-xs text-indigo-600 font-medium">You</span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          m.role === "owner"
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-slate-100 text-slate-600"
                        }`}>
                          {m.role}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{m.email}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Joined {fmtDate(m.created_at)}</p>
                    </div>
                  </div>
                  {isOwner && !isSelf && m.role !== "owner" && (
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemove(m)}
                        className="shrink-0 gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </Button>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Help text for non-owners */}
      {!isOwner && !loading && (
        <p className="text-xs text-slate-400">
          Only owners can invite or remove members. Ask the account owner if you need to add someone.
        </p>
      )}
    </motion.div>
  );
}
