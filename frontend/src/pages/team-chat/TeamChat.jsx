import React, {
  useEffect, useState, useRef, useCallback, Suspense, lazy,
} from "react";
import {
  MessageCircle, Send, ArrowLeft, Smile, Users, Hash, Search,
  MoreVertical, X, Paperclip, FileText, Download, Loader,
  Pencil, Trash2, Check, Info, Mail, Phone, Crown, UserMinus, Settings, ShieldCheck, MessageSquareOff, UserPlus, LogOut,
} from "lucide-react";
const EmojiPicker = lazy(() => import("emoji-picker-react"));
import { motion, AnimatePresence } from "framer-motion";
import { ref, push, onValue, serverTimestamp, set, off, update } from "firebase/database";
import { db, signInToFirebase } from "../../lib/firebase";
import { api, getToken } from "../../lib/api";
import { useTheme } from "../../contexts/ThemeContext";
import { confirmModal } from "../../lib/modal";
import { notifyError } from "../../lib/toast";
import { loadSeenMap, saveSeenMap, countUnread } from "../../lib/useTeamChatUnread";
import { TEAM_CHAT_READ_EVENT } from "../../lib/teamChatBadge";
import {
  getChatId, fmtTime, getAgentSip, getAgentDid, initials, isFileSupported,
} from "./helpers";
import {
  InAppNotifToast, DeleteConfirmModal, AttachThumb, MsgAttachView, MsgBubbleActions,
} from "./components";

/* ═══ MAIN COMPONENT ═══════════════════════════════════ */
export default function TeamChat({ session }) {
  const user = session?.user;
  const tenantId = session?.tenant?.id;
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const myId         = user?.id;
  const canMakeGroup = (session?.permissions || []).includes("MANAGE_TEAMS");

  /* ── Design tokens ── */
  const sidebarBg       = isDark ? "#111118" : "#fff";
  const sidebarBorder   = isDark ? "#1e1e2a" : "#f0f0f0";
  const mainBg          = isDark ? "#0c0c12" : "#fafafa";
  const headerBg        = isDark ? "#111118" : "#fff";
  const headerBorder    = isDark ? "#1e1e2a" : "#f0f0f0";
  const footerBg        = isDark ? "#111118" : "#fff";
  const footerBorder    = isDark ? "#1e1e2a" : "#f0f0f0";
  const inputRowBg      = isDark ? "#1a1a24" : "#f7f7f8";
  const inputRowBgFocus = isDark ? "#1f1f2e" : "#fff";
  const inputRowBorder  = isDark ? "#2a2a3a" : "#d0d0d0";
  const textInput       = isDark ? "#e8e8f0" : "#222";
  const textInputPH     = isDark ? "#555568" : "#bbb";
  const searchBg        = isDark ? "#1a1a24" : "#f7f7f8";
  const searchBgFocus   = isDark ? "#1f1f2e" : "#fff";
  const searchBorder    = isDark ? "#2a2a3a" : "#d0d0d0";
  const searchColor     = isDark ? "#e8e8f0" : "#222";
  const searchIcon      = isDark ? "#44445a" : "#bbb";
  const convItemHover   = isDark ? "#16161f" : "#f7f7f8";
  const convItemActive  = isDark ? "#1a1a2e" : "#f0f4ff";
  const convName        = isDark ? "#e8e8f0" : "#111";
  const convLast        = isDark ? "#55556a" : "#aaa";
  const convLastUnread  = isDark ? "#a0a0b8" : "#555";
  const convTime        = isDark ? "#3a3a52" : "#ccc";
  const noList          = isDark ? "#33334a" : "#ccc";
  const tabColor        = isDark ? "#44445a" : "#aaa";
  const tabActive       = isDark ? "#818cf8" : "#4f46e5";
  const tabBorder       = isDark ? "#1e1e2a" : "#f0f0f0";
  const sidebarTitle    = isDark ? "#e8e8f0" : "#111";
  const newBtnBg        = isDark ? "#1e1e30" : "#f0f4ff";
  const newBtnColor     = isDark ? "#818cf8" : "#4f46e5";
  const newBtnHover     = isDark ? "#26263c" : "#e0e7ff";
  const headerName      = isDark ? "#e8e8f0" : "#111";
  const headerSub       = isDark ? "#55556a" : "#aaa";
  const iconBtn         = isDark ? "#44445a" : "#999";
  const iconBtnHover    = isDark ? "#22223a" : "#f5f5f5";
  const iconBtnHoverC   = isDark ? "#c0c0d8" : "#333";
  const attachBtn       = isDark ? "#44445a" : "#999";
  const attachBtnHoverBg= isDark ? "#1e1e30" : "#f0f4ff";
  const attachBtnHoverC = isDark ? "#818cf8" : "#4f46e5";
  const bubbleThem      = isDark ? "#1e1e2e" : "#fff";
  const bubbleThemC     = isDark ? "#d8d8f0" : "#222";
  const bubbleThemShadow= isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(0,0,0,.07)";
  const senderName      = isDark ? "#818cf8" : "#4f46e5";
  const dateSepBg       = isDark ? "#1e1e2e" : "#f0f0f0";
  const dateSepColor    = isDark ? "#44445a" : "#ccc";
  const skelBg1         = isDark ? "#1a1a24" : "#f0f0f0";
  const skelBg2         = isDark ? "#22223a" : "#e8e8e8";
  const emptyIconBg     = isDark ? "#1a1a2e" : "#f0f4ff";
  const emptyH3         = isDark ? "#e8e8f0" : "#222";
  const emptyP          = isDark ? "#44445a" : "#aaa";
  const canvasBg        = isDark ? "#111118" : "#fff";
  const canvasTitle     = isDark ? "#e8e8f0" : "#111";
  const canvasClose     = isDark ? "#22223a" : "#f5f5f5";
  const canvasCloseC    = isDark ? "#a0a0b8" : "#666";
  const canvasCloseH    = isDark ? "#2a2a3e" : "#eee";
  const canvasSearch    = isDark ? "#1a1a24" : "#f7f7f8";
  const canvasSearchF   = isDark ? "#1f1f2e" : "#fff";
  const canvasSearchB   = isDark ? "#2a2a3a" : "#d0d0d0";
  const canvasSearchC   = isDark ? "#e8e8f0" : "#222";
  const canvasItemH     = isDark ? "#16161f" : "#f7f7f8";
  const sectionLabel    = isDark ? "#33334a" : "#bbb";
  const canvasItemH6    = isDark ? "#e8e8f0" : "#111";
  const canvasItemP     = isDark ? "#44445a" : "#aaa";
  const sendBtnBg       = "#4f46e5";
  const sendBtnHover    = "#4338ca";

  /* ── State ── */
  const [firebaseReady, setFirebaseReady]         = useState(false);
  const [firebaseError, setFirebaseError]         = useState("");
  const [showCanvas, setShowCanvas]               = useState(false);
  const [agents, setAgents]                       = useState([]);
  const [teams, setTeams]                         = useState([]);
  const [activeTab, setActiveTab]                 = useState("chats");
  const [search, setSearch]                       = useState("");
  const [canvasSearch2, setCanvasSearch2]         = useState("");
  const [selectedChat, setSelectedChat]           = useState(null);
  const [messages, setMessages]                   = useState([]);
  const [messagesVisible, setMessagesVisible]     = useState(false);
  const [loadingMessages, setLoadingMessages]     = useState(false);
  const [chatList, setChatList]                   = useState([]);
  const [groupList, setGroupList]                 = useState([]);
  const [messageInput, setMessageInput]           = useState("");
  const [showEmoji, setShowEmoji]                 = useState(false);
  const [sending, setSending]                     = useState(false);
  const [showCreateGroup, setShowCreateGroup]     = useState(false);
  const [groupName, setGroupName]                 = useState("");
  const [participantSearch, setParticipantSearch] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [attachments, setAttachments]             = useState([]);
  const [inAppNotifs, setInAppNotifs]             = useState([]);
  const [editState, setEditState]                 = useState(null);
  const editInputRef                              = useRef(null);
  const [deleteTarget, setDeleteTarget]           = useState(null);
  const [showDetailsPanel, setShowDetailsPanel]   = useState(false);
  const [profileAgent, setProfileAgent]           = useState(null);
  const [memberSearch, setMemberSearch]           = useState("");
  const [groupAddSearch, setGroupAddSearch]       = useState("");
  const [adminActionLoading, setAdminActionLoading] = useState("");
  const [isDragOver, setIsDragOver]               = useState(false);
  const dragCounterRef = useRef(0);

  const messagesEndRef  = useRef(null);
  const inputRef        = useRef(null);
  const fileInputRef    = useRef(null);
  const unsubMsgRef     = useRef(null);
  const notifiedRef     = useRef(new Set());
  const initialDoneRef  = useRef(false);
  const selectedChatRef = useRef(null);
  const seenMapRef      = useRef(loadSeenMap(myId));
  const agentsMapRef    = useRef({});

  // Ringnex authenticates with its own JWT, not Firebase Auth. Every
  // Realtime Database read/write below only works once this exchange
  // completes (see database.rules.json — tenantId claim gates everything).
  useEffect(() => {
    let cancelled = false;
    api("/team-chat/firebase-token", { method: "POST" })
      .then(({ token }) => signInToFirebase(token))
      .then(() => { if (!cancelled) setFirebaseReady(true); })
      .catch((err) => { if (!cancelled) setFirebaseError(err.message || "Could not connect to chat"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);

  useEffect(() => {
    api("/team-chat/directory").then((payload) => {
      const filtered = (payload.agents || []);
      setAgents(filtered);
      const map = {};
      filtered.forEach((a) => { map[a.id] = a; });
      agentsMapRef.current = map;
      setTeams(payload.teams || []);
    }).catch(() => undefined);
  }, [myId]);

  /* ── Notifications ── */
  const dismissNotif = useCallback((id) => {
    setInAppNotifs((prev) => prev.filter((n) => n.id !== id));
  }, []);

  /* ── Firebase path (tenant-namespaced) ── */
  const getMsgPath = useCallback((chat, msgKey) => {
    if (chat.type === "custom-group") return `tenants/${tenantId}/customGroupChats/${chat.id}/messages/${msgKey}`;
    if (chat.type === "group") return `tenants/${tenantId}/teamGroupChats/${chat.id}/messages/${msgKey}`;
    const id = getChatId(myId, chat.id);
    return `tenants/${tenantId}/teamChats/${id}/messages/${msgKey}`;
  }, [myId, tenantId]);

  /* ── Edit ── */
  const editMessage = useCallback(async () => {
    if (!editState || !selectedChat) return;
    const newText = editState.text.trim();
    if (!newText) return;
    await update(ref(db, getMsgPath(selectedChat, editState.msgKey)), { text: newText, editedAt: new Date().toISOString() });
    setEditState(null);
    inputRef.current?.focus();
  }, [editState, selectedChat, getMsgPath]);
  const startEdit  = useCallback((msg) => { setEditState({ msgKey: msg._key, text: msg.text || "" }); setTimeout(() => editInputRef.current?.focus(), 50); }, []);
  const cancelEdit = useCallback(() => { setEditState(null); inputRef.current?.focus(); }, []);

  /* ── Delete ── */
  const promptDelete = useCallback((msg) => { setDeleteTarget({ msg, isMe: msg.senderId == myId }); }, [myId]);
  const deleteForMe = useCallback(async () => {
    if (!deleteTarget || !selectedChat) return;
    await update(ref(db, getMsgPath(selectedChat, deleteTarget.msg._key)), { [`hiddenFor/${myId}`]: true });
    setDeleteTarget(null);
  }, [deleteTarget, selectedChat, getMsgPath, myId]);
  const deleteForEveryone = useCallback(async () => {
    if (!deleteTarget || !selectedChat) return;
    await update(ref(db, getMsgPath(selectedChat, deleteTarget.msg._key)), { deleted: true, text: null, attachments: null });
    setDeleteTarget(null);
  }, [deleteTarget, selectedChat, getMsgPath]);

  /* ── Real-time lists ── */
  useEffect(() => {
    if (!firebaseReady || !agents.length || !tenantId) return;
    const r = ref(db, `tenants/${tenantId}/teamChats/`);
    const fn = (snap) => {
      seenMapRef.current = loadSeenMap(myId);
      const list = [];
      snap.forEach((child) => {
        const chatId = child.key || "";
        const [a, b] = chatId.split("_");
        if (a !== String(myId) && b !== String(myId)) return;
        const partnerId = a === String(myId) ? b : a;
        const partner = agentsMapRef.current[partnerId];
        if (!partner) return;
        const msgSnap = child.child("messages").val();
        if (!msgSnap) return;
        const msgs = Object.values(msgSnap);
        const sorted = msgs.sort((x, y) => (y.timestamp || 0) - (x.timestamp || 0));
        const last = sorted[0];
        const chatKey = `individual_${partnerId}`;
        list.push({
          type: "individual",
          id: partnerId,
          name: partner.name,
          avatar: partner.name.substring(0, 2).toUpperCase(),
          lastMessage: last?.deleted ? "🚫 Message deleted" : (last?.text || (last?.attachments?.length ? "📎 Attachment" : "")),
          time: last?.time || new Date().toISOString(),
          unread: countUnread(Object.fromEntries(msgs.map((m, i) => [i, m])), myId, seenMapRef.current[chatKey] || 0),
          chatKey,
        });
      });
      setChatList(list);
    };
    onValue(r, fn);
    return () => off(r, "value", fn);
  }, [firebaseReady, agents, myId, tenantId]);

  useEffect(() => {
    if (!firebaseReady || !teams.length || !tenantId) return;
    const r = ref(db, `tenants/${tenantId}/teamGroupChats/`);
    const fn = (snap) => {
      seenMapRef.current = loadSeenMap(myId);
      const list = [];
      snap.forEach((child) => {
        const team = teams.find((t) => String(t.id) === String(child.key));
        if (!team) return;
        const msgSnap = child.child("messages").val();
        if (!msgSnap) return;
        const msgs = Object.values(msgSnap);
        const sorted = msgs.sort((x, y) => (y.timestamp || 0) - (x.timestamp || 0));
        const last = sorted[0];
        const chatKey = `group_${child.key}`;
        list.push({ type: "group", id: child.key, name: team.name, avatar: team.name.substring(0, 2).toUpperCase(), lastMessage: last?.deleted ? "🚫 Message deleted" : (last?.text || (last?.attachments?.length ? "📎 Attachment" : "")), time: last?.time || new Date().toISOString(), unread: countUnread(msgSnap, myId, seenMapRef.current[chatKey] || 0), chatKey });
      });
      setGroupList((prev) => [...list, ...prev.filter((g) => g.type === "custom-group")]);
    };
    onValue(r, fn); return () => off(r, "value", fn);
  }, [firebaseReady, teams, myId, tenantId]);

  useEffect(() => {
    if (!firebaseReady || !tenantId) return;
    const r = ref(db, `tenants/${tenantId}/customGroupChats/`);
    const fn = (snap) => {
      seenMapRef.current = loadSeenMap(myId);
      const list = [];
      snap.forEach((child) => {
        const group = child.val();
        if (group?.deleted) return;
        if (!group?.participants?.[myId]) return;
        if (group?.hiddenFor?.[myId]) return;
        const msgs = group.messages ? Object.values(group.messages) : [];
        const sorted = msgs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const last = sorted[0];
        const chatKey = `custom-group_${child.key}`;
        list.push({ id: child.key, type: "custom-group", name: group.name, avatar: group.name.substring(0, 2).toUpperCase(), lastMessage: last?.deleted ? "🚫 Message deleted" : (last?.text || (last?.attachments?.length ? "📎 Attachment" : "")), time: last?.time || new Date().toISOString(), unread: countUnread(group.messages || {}, myId, seenMapRef.current[chatKey] || 0), chatKey, participants: group.participantDetails || {}, admins: group.admins || {}, createdBy: group.createdBy, settings: group.settings || {} });
      });
      setGroupList((prev) => [...prev.filter((g) => g.type !== "custom-group"), ...list]);
    };
    onValue(r, fn); return () => off(r, "value", fn);
  }, [firebaseReady, myId, tenantId]);

  /* ── Open chat ── */
  const openChatWith = useCallback((chat) => {
    if (unsubMsgRef.current) { unsubMsgRef.current(); unsubMsgRef.current = null; }
    notifiedRef.current.clear();
    initialDoneRef.current = false;
    setSelectedChat(chat); setMessages([]); setMessagesVisible(false);
    setLoadingMessages(true); setShowCanvas(false); setAttachments([]); setEditState(null);
    const chatKey = chat.chatKey || `${chat.type}_${chat.id}`;
    seenMapRef.current[chatKey] = Date.now();
    saveSeenMap(seenMapRef.current, myId);
    window.dispatchEvent(new CustomEvent(TEAM_CHAT_READ_EVENT, { detail: { chatKey } }));
    const clearUnread = (list) => list.map((c) => c.chatKey === chatKey ? { ...c, unread: 0 } : c);
    if (chat.type === "individual") setChatList(clearUnread); else setGroupList(clearUnread);
    let msgRef;
    if (chat.type === "custom-group") msgRef = ref(db, `tenants/${tenantId}/customGroupChats/${chat.id}/messages`);
    else if (chat.type === "group") msgRef = ref(db, `tenants/${tenantId}/teamGroupChats/${chat.id}/messages`);
    else { const id = getChatId(myId, chat.id); msgRef = ref(db, `tenants/${tenantId}/teamChats/${id}/messages`); }
    let isFirst = true;
    const handler = (snap) => {
      const data = snap.val() || {};
      const arr = Object.entries(data).map(([k, v]) => ({ ...v, _key: k }))
        .filter((m) => !m.hiddenFor?.[myId])
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      if (isFirst) {
        isFirst = false;
        arr.forEach((m) => notifiedRef.current.add(`${m.timestamp}_${m.senderId}_${m.text}`));
        initialDoneRef.current = true;
        setMessages(arr); setLoadingMessages(false);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
          setTimeout(() => { setMessagesVisible(true); setTimeout(() => inputRef.current?.focus(), 80); }, 50);
        }));
      } else {
        if (initialDoneRef.current) {
          arr.forEach((m) => {
            const key = `${m.timestamp}_${m.senderId}_${m.text}`;
            if (notifiedRef.current.has(key)) return;
            if (m.senderId == myId) { notifiedRef.current.add(key); return; }
            notifiedRef.current.add(key);
            const ck = selectedChatRef.current?.chatKey;
            if (ck) { seenMapRef.current[ck] = Date.now(); saveSeenMap(seenMapRef.current, myId); }
          });
        }
        setMessages(arr);
      }
    };
    onValue(msgRef, handler);
    unsubMsgRef.current = () => off(msgRef, "value", handler);
  }, [myId, tenantId]);

  const openFromNotifFn = useCallback((notif) => { dismissNotif(notif.id); if (notif.chat) openChatWith(notif.chat); }, [dismissNotif, openChatWith]);
  const prevLen = useRef(0);
  useEffect(() => {
    if (!messagesVisible) return;
    if (messages.length > prevLen.current) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    prevLen.current = messages.length;
  }, [messages.length, messagesVisible]);
  useEffect(() => () => { unsubMsgRef.current?.(); }, []);

  // Keep selected custom group metadata fresh while details/settings are open
  useEffect(() => {
    if (!firebaseReady || !selectedChat || selectedChat.type !== "custom-group") return;
    const groupRef = ref(db, `tenants/${tenantId}/customGroupChats/${selectedChat.id}`);
    const fn = (snap) => {
      const group = snap.val();
      if (!group) return;
      if (group?.deleted || group?.hiddenFor?.[myId] || !group?.participants?.[myId]) {
        setSelectedChat(null);
        setShowDetailsPanel(false);
        setMessages([]);
        return;
      }
      setSelectedChat((prev) => {
        if (!prev || prev.type !== "custom-group" || prev.id !== selectedChat.id) return prev;
        return {
          ...prev,
          name: group.name || prev.name,
          participants: group.participantDetails || {},
          admins: group.admins || {},
          createdBy: group.createdBy,
          settings: group.settings || {},
          hiddenFor: group.hiddenFor || {},
        };
      });
    };
    onValue(groupRef, fn);
    return () => off(groupRef, "value", fn);
  }, [firebaseReady, selectedChat?.id, selectedChat?.type, myId, tenantId]);

  const openDetailsPanel = useCallback(() => {
    if (!selectedChat) return;
    setShowDetailsPanel(true);
    setMemberSearch("");
    setGroupAddSearch("");
    if (selectedChat.type === "individual") {
      setProfileAgent(agentsMapRef.current[selectedChat.id] || null);
    }
  }, [selectedChat]);

  const updateCustomGroup = useCallback(async (patch) => {
    if (!selectedChat || selectedChat.type !== "custom-group") return;
    await update(ref(db, `tenants/${tenantId}/customGroupChats/${selectedChat.id}`), patch);
  }, [selectedChat, tenantId]);

  const pushGroupSystemMessage = useCallback(async (groupId, text, extra = {}) => {
    if (!groupId || !text) return;
    await push(ref(db, `tenants/${tenantId}/customGroupChats/${groupId}/messages`), {
      type: "system",
      text,
      senderId: "system",
      senderName: "System",
      time: new Date().toISOString(),
      timestamp: serverTimestamp(),
      ...extra,
    });
  }, [tenantId]);

  const makeGroupAdmin = useCallback(async (member) => {
    if (!selectedChat || selectedChat.type !== "custom-group" || !selectedChat.admins?.[myId]) return;
    setAdminActionLoading(`admin-${member.id}`);
    try {
      await updateCustomGroup({ [`admins/${member.id}`]: true });
      await pushGroupSystemMessage(selectedChat.id, `${user?.name || "Admin"} made ${member.name || "a member"} a group admin.`);
    } finally {
      setAdminActionLoading("");
    }
  }, [selectedChat, myId, updateCustomGroup, pushGroupSystemMessage, user?.name]);

  const removeGroupAdmin = useCallback(async (member) => {
    if (!selectedChat || selectedChat.type !== "custom-group" || !selectedChat.admins?.[myId]) return;
    if (String(member.id) === String(myId)) return;
    setAdminActionLoading(`demote-${member.id}`);
    try {
      await updateCustomGroup({ [`admins/${member.id}`]: null });
      await pushGroupSystemMessage(selectedChat.id, `${user?.name || "Admin"} removed ${member.name || "a member"} as group admin.`);
    } finally {
      setAdminActionLoading("");
    }
  }, [selectedChat, myId, updateCustomGroup, pushGroupSystemMessage, user?.name]);

  const addGroupMember = useCallback(async (agent) => {
    if (!selectedChat || selectedChat.type !== "custom-group" || !selectedChat.admins?.[myId]) return;
    if (!agent?.id || selectedChat.participants?.[agent.id]) return;
    setAdminActionLoading(`add-${agent.id}`);
    try {
      await updateCustomGroup({
        [`participants/${agent.id}`]: true,
        [`participantDetails/${agent.id}`]: { id: agent.id, name: agent.name, email: agent.email || "" },
        [`hiddenFor/${agent.id}`]: null,
      });
      await pushGroupSystemMessage(selectedChat.id, `${user?.name || "Admin"} added ${agent.name || "a member"}.`);
      setGroupAddSearch("");
    } finally {
      setAdminActionLoading("");
    }
  }, [selectedChat, myId, updateCustomGroup, pushGroupSystemMessage, user?.name]);

  const removeGroupMember = useCallback(async (member) => {
    if (!selectedChat || selectedChat.type !== "custom-group" || !selectedChat.admins?.[myId]) return;
    if (String(member.id) === String(myId)) return;
    const confirmed = await confirmModal({ title: "Remove member?", message: `Remove ${member.name || "this member"} from ${selectedChat.name}?`, danger: true });
    if (!confirmed) return;
    setAdminActionLoading(`remove-${member.id}`);
    try {
      await pushGroupSystemMessage(selectedChat.id, `${user?.name || "Admin"} removed ${member.name || "a member"}.`);
      await updateCustomGroup({
        [`participants/${member.id}`]: null,
        [`participantDetails/${member.id}`]: null,
        [`admins/${member.id}`]: null,
      });
    } finally {
      setAdminActionLoading("");
    }
  }, [selectedChat, myId, updateCustomGroup, pushGroupSystemMessage, user?.name]);

  const leaveCustomGroup = useCallback(async () => {
    if (!selectedChat || selectedChat.type !== "custom-group") return;
    const memberIds = Object.keys(selectedChat.participants || {});
    if (!memberIds.includes(String(myId))) return;
    const confirmed = await confirmModal({ title: "Leave group?", message: `Leave ${selectedChat.name}?`, danger: true });
    if (!confirmed) return;
    setAdminActionLoading("leave-group");
    try {
      const remainingIds = memberIds.filter((id) => String(id) !== String(myId));
      const otherAdmins = Object.keys(selectedChat.admins || {}).filter((id) => String(id) !== String(myId) && selectedChat.participants?.[id]);
      const patch = {
        [`participants/${myId}`]: null,
        [`participantDetails/${myId}`]: null,
        [`admins/${myId}`]: null,
      };
      if (!remainingIds.length) {
        patch.deleted = true;
        patch.deletedAt = Date.now();
        patch.deletedBy = myId;
      } else if (selectedChat.admins?.[myId] && otherAdmins.length === 0) {
        patch[`admins/${remainingIds[0]}`] = true;
      }
      await pushGroupSystemMessage(selectedChat.id, `${user?.name || "A member"} left the group.`);
      await updateCustomGroup(patch);
      setGroupList((prev) => prev.filter((g) => !(g.type === "custom-group" && String(g.id) === String(selectedChat.id))));
      setSelectedChat(null);
      setShowDetailsPanel(false);
      setMessages([]);
    } finally {
      setAdminActionLoading("");
    }
  }, [selectedChat, myId, updateCustomGroup, pushGroupSystemMessage, user?.name]);

  const toggleOnlyAdminsCanSend = useCallback(async (checked) => {
    if (!selectedChat || selectedChat.type !== "custom-group" || !selectedChat.admins?.[myId]) return;
    setAdminActionLoading("only-admin-send");
    try {
      await updateCustomGroup({ "settings/onlyAdminsCanSend": checked });
      await pushGroupSystemMessage(selectedChat.id, checked ? `${user?.name || "Admin"} changed group settings: only admins can send messages.` : `${user?.name || "Admin"} changed group settings: all participants can send messages.`);
    } finally {
      setAdminActionLoading("");
    }
  }, [selectedChat, myId, updateCustomGroup, pushGroupSystemMessage, user?.name]);

  const deleteCustomGroupForEveryone = useCallback(async () => {
    if (!selectedChat || selectedChat.type !== "custom-group" || !selectedChat.admins?.[myId]) return;
    const confirmed = await confirmModal({ title: "Delete group?", message: `Delete ${selectedChat.name} for everyone? It will disappear for all participants.`, danger: true });
    if (!confirmed) return;
    setAdminActionLoading("delete-group");
    try {
      await pushGroupSystemMessage(selectedChat.id, `${user?.name || "Admin"} deleted this group.`);
      await updateCustomGroup({ deleted: true, deletedAt: Date.now(), deletedBy: myId });
      setGroupList((prev) => prev.filter((g) => !(g.type === "custom-group" && String(g.id) === String(selectedChat.id))));
      setSelectedChat(null);
      setShowDetailsPanel(false);
      setMessages([]);
    } finally {
      setAdminActionLoading("");
    }
  }, [selectedChat, myId, updateCustomGroup, pushGroupSystemMessage, user?.name]);

  /* ── File upload ── */
  const toAttachEntries = (files) =>
    files.map((f) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      file: f,
      status: isFileSupported(f) ? "pending" : "unsupported",
      progress: 0,
    }));

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setAttachments((prev) => [...prev, ...toAttachEntries(files)]);
    e.target.value = "";
  };

  const addFiles = useCallback((files) => {
    if (!files.length) return;
    setAttachments((prev) => [...prev, ...toAttachEntries(files)]);
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);
  const handleDragOver = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    if (!selectedChat || editState) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addFiles(files);
  }, [selectedChat, editState, addFiles]);
  const removeAttachment = useCallback((id) => {
    setAttachments((prev) => { const f = prev.find((x) => x.id === id); if (f?.status === "uploading" && f.cancelFn) f.cancelFn(); return prev.filter((x) => x.id !== id); });
  }, []);

  const uploadOne = (entry) =>
    new Promise((resolve) => {
      const fd = new FormData(); fd.append("file", entry.file);
      const xhr = new XMLHttpRequest();
      setAttachments((prev) => prev.map((f) => f.id === entry.id ? { ...f, status: "uploading", progress: 0, cancelFn: () => xhr.abort() } : f));
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) { const pct = Math.round((e.loaded / e.total) * 100); setAttachments((prev) => prev.map((f) => f.id === entry.id ? { ...f, progress: pct } : f)); } };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { const data = JSON.parse(xhr.responseText); const url = data.url; setAttachments((prev) => prev.map((f) => f.id === entry.id ? { ...f, status: "done", progress: 100, url } : f)); resolve({ url, fileName: entry.file.name, mimeType: entry.file.type, size: entry.file.size }); }
          catch { setAttachments((prev) => prev.map((f) => f.id === entry.id ? { ...f, status: "error" } : f)); resolve(null); }
        } else { setAttachments((prev) => prev.map((f) => f.id === entry.id ? { ...f, status: "error" } : f)); resolve(null); }
      };
      xhr.onerror = () => { setAttachments((prev) => prev.map((f) => f.id === entry.id ? { ...f, status: "error" } : f)); resolve(null); };
      xhr.onabort = () => { setAttachments((prev) => prev.map((f) => f.id === entry.id ? { ...f, status: "cancelled" } : f)); resolve(null); };
      xhr.open("POST", "/api/team-chat/upload");
      const token = getToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.send(fd);
    });

  /* ── Send ── */
  const sendMessage = useCallback(async () => {
    const text = messageInput.trim();
    const toUpload = attachments.filter((f) => f.status === "pending");
    const hasDone = attachments.some((f) => f.status === "done" && f.url);
    if (!text && !toUpload.length && !hasDone) return;
    if (!selectedChat || sending) return;
    if (selectedChat.type === "custom-group" && selectedChat.settings?.onlyAdminsCanSend === true && !selectedChat.admins?.[myId]) {
      notifyError("Only group admins can send messages in this group.");
      return;
    }
    setSending(true);
    const uploaded = [];
    if (toUpload.length) { const results = await Promise.all(toUpload.map(uploadOne)); results.forEach((r) => { if (r) uploaded.push(r); }); }
    attachments.filter((f) => f.status === "done" && f.url).forEach((f) => { if (!uploaded.find((u) => u.url === f.url)) uploaded.push({ url: f.url, fileName: f.file.name, mimeType: f.file.type, size: f.file.size }); });
    let msgPath;
    if (selectedChat.type === "custom-group") msgPath = `tenants/${tenantId}/customGroupChats/${selectedChat.id}/messages`;
    else if (selectedChat.type === "group") msgPath = `tenants/${tenantId}/teamGroupChats/${selectedChat.id}/messages`;
    else { const id = getChatId(myId, selectedChat.id); msgPath = `tenants/${tenantId}/teamChats/${id}/messages`; }
    setMessageInput("");
    if (inputRef.current) inputRef.current.style.height = "36px";
    setShowEmoji(false); setAttachments([]);
    const payload = { senderId: myId, senderName: user.name, time: new Date().toISOString(), timestamp: serverTimestamp() };
    if (text) payload.text = text;
    if (uploaded.length) payload.attachments = uploaded;
    await push(ref(db, msgPath), payload);
    setSending(false);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "instant" }), 0);
  }, [messageInput, attachments, selectedChat, myId, user?.name, sending, tenantId]);

  const createCustomGroup = async () => {
    if (!groupName.trim() || !selectedParticipants.length) return;
    const gRef = push(ref(db, `tenants/${tenantId}/customGroupChats`));
    const pm = { [myId]: true }; const pd = { [myId]: { id: myId, name: user.name, email: user.email || "" } };
    selectedParticipants.forEach((p) => { pm[p.id] = true; pd[p.id] = { id: p.id, name: p.name, email: p.email || "" }; });
    await set(gRef, { id: gRef.key, type: "custom", name: groupName.trim(), createdBy: myId, admins: { [myId]: true }, createdAt: Date.now(), participants: pm, participantDetails: pd, settings: { onlyAdminsCanSend: false }, messages: {} });
    await push(ref(db, `tenants/${tenantId}/customGroupChats/${gRef.key}/messages`), { type: "system", text: `${user?.name || "Admin"} created this group.`, senderId: "system", senderName: "System", time: new Date().toISOString(), timestamp: serverTimestamp() });
    await push(ref(db, `tenants/${tenantId}/customGroupChats/${gRef.key}/messages`), { type: "system", text: `${user?.name || "Admin"} added ${selectedParticipants.map((p) => p.name).join(", ")}.`, senderId: "system", senderName: "System", time: new Date().toISOString(), timestamp: serverTimestamp() });
    setShowCreateGroup(false); setGroupName(""); setSelectedParticipants([]); setParticipantSearch("");
  };

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const handleEditKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); editMessage(); } if (e.key === "Escape") cancelEdit(); };

  const displayedList    = (activeTab === "chats" ? chatList : groupList).filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const filteredAgents   = agents.filter((a) => a.name.toLowerCase().includes(canvasSearch2.toLowerCase()));
  const filteredTeams    = teams.filter((t) => t.name.toLowerCase().includes(canvasSearch2.toLowerCase()));
  const totalChatUnread  = chatList.reduce((s, c) => s + (c.unread || 0), 0);
  const totalGroupUnread = groupList.reduce((s, c) => s + (c.unread || 0), 0);
  const hasMessageContent = messageInput.trim().length > 0 || attachments.some((f) => f.status !== "cancelled" && f.status !== "error" && f.status !== "unsupported");
  const selectedIsCustomGroup = selectedChat?.type === "custom-group";
  const selectedGroupSettings = selectedChat?.settings || {};
  const onlyAdminsCanSend = selectedIsCustomGroup && selectedGroupSettings.onlyAdminsCanSend === true;
  const iAmSelectedGroupAdmin = selectedIsCustomGroup && !!selectedChat?.admins?.[myId];
  const blockedByAdminOnly = onlyAdminsCanSend && !iAmSelectedGroupAdmin;
  const canSend = !sending && hasMessageContent && !blockedByAdminOnly;

  const activeTeam = selectedChat?.type === "group" ? teams.find((t) => String(t.id) === String(selectedChat.id)) : null;
  const selectedGroupMembers = selectedChat?.type === "custom-group"
    ? Object.values(selectedChat.participants || {})
    : selectedChat?.type === "group"
      ? (activeTeam?.members || [])
      : [];
  const filteredGroupMembers = selectedGroupMembers
    .filter((m) => String(m?.name || "").toLowerCase().includes(memberSearch.toLowerCase()))
    .sort((a, b) => Number(!!selectedChat?.admins?.[b.id]) - Number(!!selectedChat?.admins?.[a.id]) || String(a?.name || "").localeCompare(String(b?.name || "")));
  const addableGroupAgents = selectedChat?.type === "custom-group"
    ? agents
        .filter((a) => !selectedChat.participants?.[a.id])
        .filter((a) => String(a?.name || "").toLowerCase().includes(groupAddSearch.toLowerCase()))
        .slice(0, 6)
    : [];

  if (firebaseError) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 40, textAlign: "center" }}>
        <MessageCircle size={30} color="#ef4444" />
        <p style={{ fontSize: 14, color: isDark ? "#e8e8f0" : "#111", fontWeight: 600 }}>Team Chat couldn't connect</p>
        <p style={{ fontSize: 12.5, color: isDark ? "#6b6b7b" : "#6b7280" }}>{firebaseError}</p>
      </div>
    );
  }
  if (!firebaseReady) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <Loader size={20} color="#4f46e5" style={{ animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 13, color: isDark ? "#a0a0b8" : "#6b7280" }}>Connecting to Team Chat…</span>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=DM+Mono:wght@400;500&display=swap');
        .tc-root*{font-family:'DM Sans',sans-serif;box-sizing:border-box}
        @keyframes tc-spin{to{transform:rotate(360deg)}}
        @keyframes tcShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes tc-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes tc-slide-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes tc-check{from{stroke-dashoffset:24}to{stroke-dashoffset:0}}
        .tc-sidebar{width:300px;min-width:280px;background:${sidebarBg};border-right:1px solid ${sidebarBorder};display:flex;flex-direction:column;height:100%;flex-shrink:0;transition:background 0.2s,border-color 0.2s}
        .tc-sidebar-header{padding:20px 18px 14px;border-bottom:1px solid ${sidebarBorder};display:flex;align-items:center;justify-content:space-between}
        .tc-sidebar-title{font-size:20px;font-weight:600;color:${sidebarTitle};letter-spacing:-.4px}
        .tc-new-btn{width:34px;height:34px;border-radius:50%;border:none;background:${newBtnBg};color:${newBtnColor};cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;margin-left:6px}
        .tc-new-btn:hover{background:${newBtnHover}}
        .tc-tabs{display:flex;border-bottom:1px solid ${tabBorder};padding:0 12px;gap:4px}
        .tc-tab{flex:1;padding:11px 0;font-size:13.5px;font-weight:500;color:${tabColor};background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;transition:color .15s,border-color .15s;display:flex;align-items:center;justify-content:center;gap:6px}
        .tc-tab.active{color:${tabActive};border-bottom-color:${tabActive}}
        .tc-search-wrap{padding:10px 14px;position:relative}
        .tc-search{width:100%;background:${searchBg};border:1.5px solid transparent;border-radius:10px;padding:8px 12px 8px 36px;font-size:13px;color:${searchColor};outline:none;transition:border-color .15s,background .15s;font-family:'DM Sans',sans-serif}
        .tc-search:focus{background:${searchBgFocus};border-color:${searchBorder}}
        .tc-search-icon{position:absolute;left:24px;top:50%;transform:translateY(-50%);color:${searchIcon};pointer-events:none}
        .tc-conv-list{flex:1;overflow-y:auto;padding:6px 8px 12px;scrollbar-width:thin;scrollbar-color:${isDark?"#1e1e2a":"#eee"} transparent}
        .tc-conv-item{display:flex;align-items:center;gap:11px;padding:10px 11px;border-radius:12px;cursor:pointer;transition:background .12s}
        .tc-conv-item:hover{background:${convItemHover}}
        .tc-conv-item.active{background:${convItemActive}}
        .tc-avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px;flex-shrink:0}
        .tc-avatar.group{background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%)}
        .tc-avatar.sm{width:40px;height:40px;font-size:13px}
        .tc-conv-info{flex:1;min-width:0}
        .tc-conv-name{font-size:13.5px;font-weight:500;color:${convName};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .tc-conv-last{font-size:12px;color:${convLast};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
        .tc-conv-time{font-size:10.5px;color:${convTime};font-family:'DM Mono',monospace;flex-shrink:0}
        .tc-badge{background:#4f46e5;color:#fff;font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;padding:0 5px;display:inline-flex;align-items:center;justify-content:center}
        .tc-tab-badge{background:#ef4444;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;border-radius:8px;padding:0 4px;display:inline-flex;align-items:center;justify-content:center}
        .tc-main{flex:1;display:flex;flex-direction:column;background:${mainBg};min-width:0;transition:background 0.2s}
        .tc-chat-header{background:${headerBg};border-bottom:1px solid ${headerBorder};padding:13px 20px;display:flex;align-items:center;gap:13px;transition:background 0.2s}
        .tc-header-info{flex:1}
        .tc-header-name{font-size:15px;font-weight:600;color:${headerName};letter-spacing:-.2px}
        .tc-header-sub{font-size:12px;color:${headerSub};margin-top:1px}
        .tc-header-sub.online{color:#22c55e;font-weight:500}
        .tc-icon-btn{width:36px;height:36px;border-radius:50%;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:${iconBtn};transition:background .12s,color .12s}
        .tc-icon-btn:hover{background:${iconBtnHover};color:${iconBtnHoverC}}
        .tc-messages-area{flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:3px;scrollbar-width:thin;scrollbar-color:${isDark?"#1e1e2a":"#e0e0e0"} transparent;opacity:0;transition:opacity .25s ease}
        .tc-messages-area.visible{opacity:1}
        .tc-loading-wrap{flex:1;display:flex;flex-direction:column;gap:14px;padding:24px;justify-content:flex-end}
        .tc-skel{height:38px;border-radius:16px;background:linear-gradient(90deg,${skelBg1} 25%,${skelBg2} 50%,${skelBg1} 75%);background-size:200% 100%;animation:tcShimmer 1.4s infinite}
        .tc-date-sep{text-align:center;margin:14px 0 10px}
        .tc-date-sep span{font-size:11px;color:${dateSepColor};background:${dateSepBg};padding:3px 12px;border-radius:20px;font-weight:500}
        .tc-system-msg{align-self:center;max-width:78%;margin:8px auto;padding:6px 12px;border-radius:999px;background:${isDark?"rgba(255,255,255,0.06)":"#eef2ff"};color:${isDark?"#a5b4fc":"#4338ca"};font-size:11.5px;font-weight:700;text-align:center;line-height:1.45}
        .tc-msg-row{display:flex;margin-bottom:1px;align-items:flex-end;gap:6px}
        .tc-msg-row.me{justify-content:flex-end}
        .tc-msg-row.them{justify-content:flex-start}
        .tc-bubble{max-width:62%;padding:10px 14px;border-radius:18px;font-size:13.5px;line-height:1.55;word-break:break-word;white-space:pre-wrap}
        .tc-bubble.me{background:#4f46e5;color:#fff;border-bottom-right-radius:4px}
        .tc-bubble.them{background:${bubbleThem};color:${bubbleThemC};border-bottom-left-radius:4px;box-shadow:${bubbleThemShadow}}
        .tc-bubble.deleted{background:${isDark?"#1a1a24":"#f3f4f6"} !important;border:1px dashed ${isDark?"#2a2a3a":"#d1d5db"} !important;box-shadow:none !important}
        .tc-sender-name{font-size:11px;font-weight:700;margin-bottom:4px;color:${senderName}}
        .tc-msg-time{font-size:10px;margin-top:4px;text-align:right;opacity:.5;font-family:'DM Mono',monospace}
        .tc-footer{background:${footerBg};border-top:1px solid ${footerBorder};padding:10px 16px 12px;position:relative;transition:background 0.2s}
        .tc-attach-list{display:flex;flex-direction:column;gap:5px;padding:8px 0 10px;max-height:210px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:${isDark?"#1e1e2a":"#eee"} transparent}
        .tc-attach-list::-webkit-scrollbar{width:3px}
        .tc-attach-list::-webkit-scrollbar-thumb{background:${isDark?"#1e1e2a":"#eee"};border-radius:4px}
        .tc-upload-header{display:flex;align-items:center;justify-content:space-between;padding:0 2px 6px;font-size:11px;font-weight:600;color:${isDark?"#55556a":"#9ca3af"};letter-spacing:.04em}
        .tc-input-row{display:flex;align-items:center;gap:8px;background:${inputRowBg};border:1.5px solid transparent;border-radius:14px;padding:5px 7px 5px 12px;transition:border-color .15s,background .15s}
        .tc-input-row:focus-within{background:${inputRowBgFocus};border-color:${inputRowBorder}}
        .tc-input-row.edit-mode{border-color:${isDark?"rgba(250,204,21,0.35)":"rgba(234,179,8,0.4)"};background:${isDark?"rgba(250,204,21,0.05)":"rgba(254,252,232,0.8)"}}
        .tc-input-row.edit-mode:focus-within{border-color:${isDark?"rgba(250,204,21,0.55)":"rgba(234,179,8,0.6)"}}
        .tc-text-input{flex:1;background:transparent;border:none;outline:none;font-size:13.5px;color:${textInput};padding:7px 0;font-family:'DM Sans',sans-serif;resize:none;overflow-y:auto;max-height:120px;min-height:36px;line-height:1.55}
        .tc-text-input::placeholder{color:${textInputPH}}
        .tc-attach-btn{width:32px;height:32px;border-radius:9px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:${attachBtn};transition:background .12s,color .12s}
        .tc-attach-btn:hover{background:${attachBtnHoverBg};color:${attachBtnHoverC}}
        .tc-send-btn{width:36px;height:36px;border-radius:10px;background:${sendBtnBg};border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;transition:background .15s,transform .1s;flex-shrink:0}
        .tc-send-btn:hover{background:${sendBtnHover}}
        .tc-send-btn:active{transform:scale(.95)}
        .tc-send-btn:disabled{background:${isDark?"#2a2a3e":"#e0e0e0"};cursor:not-allowed}
        .tc-send-btn.edit{background:${isDark?"#ca8a04":"#d97706"}}
        .tc-send-btn.edit:hover{background:${isDark?"#a16207":"#b45309"}}
        .tc-emoji-wrap{position:absolute;bottom:74px;right:20px;z-index:50;box-shadow:0 8px 32px rgba(0,0,0,.12);border-radius:16px;overflow:hidden}
        .tc-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center}
        .tc-empty-icon{width:72px;height:72px;border-radius:50%;background:${emptyIconBg};display:flex;align-items:center;justify-content:center;margin-bottom:18px}
        .tc-empty h3{font-size:17px;font-weight:600;color:${emptyH3};margin:0 0 8px}
        .tc-empty p{font-size:13px;color:${emptyP};max-width:240px;line-height:1.6;margin:0 0 20px}
        .tc-start-btn{display:flex;align-items:center;gap:7px;padding:9px 18px;background:#4f46e5;color:#fff;border:none;border-radius:10px;font-size:13.5px;font-weight:500;cursor:pointer;transition:background .15s;font-family:'DM Sans',sans-serif}
        .tc-start-btn:hover{background:#4338ca}
        .tc-canvas-overlay{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:100;display:flex;justify-content:flex-end}
        .tc-canvas{width:340px;height:100%;background:${canvasBg};display:flex;flex-direction:column;box-shadow:-8px 0 32px rgba(0,0,0,${isDark?".40":".12"})}
        .tc-canvas-header{padding:20px 18px 16px;border-bottom:1px solid ${sidebarBorder};display:flex;align-items:center;justify-content:space-between}
        .tc-canvas-title{font-size:17px;font-weight:600;color:${canvasTitle}}
        .tc-canvas-close{width:32px;height:32px;border-radius:50%;border:none;background:${canvasClose};cursor:pointer;display:flex;align-items:center;justify-content:center;color:${canvasCloseC};transition:background .12s}
        .tc-canvas-close:hover{background:${canvasCloseH}}
        .tc-canvas-search-wrap{padding:12px 16px;position:relative}
        .tc-canvas-search{width:100%;background:${canvasSearch};border:1.5px solid transparent;border-radius:10px;padding:9px 12px 9px 36px;font-size:13px;color:${canvasSearchC};outline:none;transition:border-color .15s,background .15s;font-family:'DM Sans',sans-serif}
        .tc-canvas-search:focus{background:${canvasSearchF};border-color:${canvasSearchB}}
        .tc-canvas-body{flex:1;overflow-y:auto}
        .tc-section-label{padding:10px 16px 6px;font-size:11px;font-weight:600;color:${sectionLabel};text-transform:uppercase;letter-spacing:.6px}
        .tc-canvas-item{display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;transition:background .12s}
        .tc-canvas-item:hover{background:${canvasItemH}}
        .tc-canvas-item-info h6{font-size:13.5px;font-weight:500;color:${canvasItemH6};margin:0 0 2px}
        .tc-canvas-item-info p{font-size:12px;color:${canvasItemP};margin:0}
        .tc-no-list{padding:20px 16px;font-size:13px;color:${noList};text-align:center}
        .tc-conv-list::-webkit-scrollbar,.tc-messages-area::-webkit-scrollbar,.tc-canvas-body::-webkit-scrollbar{width:4px}
        .tc-conv-list::-webkit-scrollbar-thumb,.tc-messages-area::-webkit-scrollbar-thumb,.tc-canvas-body::-webkit-scrollbar-thumb{background:${isDark?"#1e1e2a":"#eee"};border-radius:4px}
        .tc-msg-row:hover .tc-msg-actions{opacity:1 !important}
        .tc-edit-bar{display:flex;align-items:center;gap:8px;padding:6px 4px 8px;font-size:12px;color:${isDark?"#ca8a04":"#92400e"}}
        .tc-details-overlay{position:fixed;inset:0;background:rgba(0,0,0,.30);z-index:120;display:flex;justify-content:flex-end}
        .tc-details-panel{width:380px;max-width:92vw;height:100%;background:${canvasBg};box-shadow:-12px 0 36px rgba(0,0,0,${isDark?".42":".14"});display:flex;flex-direction:column;border-left:1px solid ${sidebarBorder}}
        .tc-detail-row{display:flex;align-items:center;gap:11px;padding:12px 14px;border-radius:14px;background:${isDark?"#16161f":"#f8fafc"};border:1px solid ${isDark?"#242436":"#edf2f7"}}
        .tc-detail-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:${sectionLabel};margin-bottom:3px}
        .tc-detail-value{font-size:13.5px;font-weight:650;color:${headerName};word-break:break-word}
        .tc-member-row{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:14px;transition:background .12s}
        .tc-member-row:hover{background:${canvasItemH}}
        .tc-action-chip{border:none;border-radius:999px;padding:6px 9px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:'DM Sans',sans-serif;display:inline-flex;align-items:center;gap:5px}
        .tc-setting-card{padding:14px;border-radius:16px;background:${isDark?"#16161f":"#f8fafc"};border:1px solid ${isDark?"#242436":"#edf2f7"}}
        .tc-drop-overlay{position:absolute;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:${isDark?"rgba(12,12,18,0.88)":"rgba(240,244,255,0.92)"};backdrop-filter:blur(4px);border:2.5px dashed #4f46e5;border-radius:0;pointer-events:none;animation:tc-drop-in .15s ease}
        @keyframes tc-drop-in{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
        .tc-drop-icon{width:72px;height:72px;border-radius:20px;background:rgba(79,70,229,0.14);display:flex;align-items:center;justify-content:center}
        .tc-drop-title{font-size:17px;font-weight:700;color:${isDark?"#e0e0f8":"#2d2b6e"};letter-spacing:-.2px}
        .tc-drop-sub{font-size:13px;color:${isDark?"#6666a0":"#7c7cb8"};font-weight:500}
      `}</style>

      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmModal isMe={deleteTarget.isMe} isDark={isDark}
            onDeleteForMe={deleteForMe} onDeleteForEveryone={deleteForEveryone}
            onCancel={() => setDeleteTarget(null)} />
        )}
      </AnimatePresence>

      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end", pointerEvents: "none" }}>
        <AnimatePresence mode="popLayout">
          {inAppNotifs.map((notif) => (
            <div key={notif.id} style={{ pointerEvents: "auto" }}>
              <InAppNotifToast notif={notif} onDismiss={dismissNotif} onOpen={openFromNotifFn} />
            </div>
          ))}
        </AnimatePresence>
      </div>

      <div className="tc-root" style={{ height: "calc(100vh - 64px)", display: "flex", overflow: "hidden" }}>

        <aside className="tc-sidebar">
          <div className="tc-sidebar-header">
            <div className="tc-sidebar-title">Team Chat</div>
            <div style={{ display: "flex" }}>
              {canMakeGroup && <button className="tc-new-btn" onClick={() => setShowCreateGroup(true)} title="Create Group"><Users size={15} /></button>}
              <button className="tc-new-btn" onClick={() => setShowCanvas(true)} title="New conversation"><MessageCircle size={16} /></button>
            </div>
          </div>
          <div className="tc-tabs">
            <button className={`tc-tab ${activeTab === "chats" ? "active" : ""}`} onClick={() => setActiveTab("chats")}>
              Chats {totalChatUnread > 0 && <span className="tc-tab-badge">{totalChatUnread > 99 ? "99+" : totalChatUnread}</span>}
            </button>
            <button className={`tc-tab ${activeTab === "groups" ? "active" : ""}`} onClick={() => setActiveTab("groups")}>
              Groups {totalGroupUnread > 0 && <span className="tc-tab-badge">{totalGroupUnread > 99 ? "99+" : totalGroupUnread}</span>}
            </button>
          </div>
          <div className="tc-search-wrap">
            <Search size={14} className="tc-search-icon" />
            <input type="text" className="tc-search" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="tc-conv-list">
            {displayedList.length === 0
              ? <div className="tc-no-list">{activeTab === "chats" ? "No chats yet" : "No groups yet"}</div>
              : displayedList.map((conv) => (
                <div key={`${conv.type}-${conv.id}`}
                  className={`tc-conv-item ${selectedChat?.id === conv.id && selectedChat?.type === conv.type ? "active" : ""}`}
                  onClick={() => openChatWith(conv)}>
                  <div className={`tc-avatar sm ${conv.type !== "individual" ? "group" : ""}`}>
                    {conv.type !== "individual" ? <Hash size={16} /> : conv.avatar}
                  </div>
                  <div className="tc-conv-info">
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="tc-conv-name" style={{ fontWeight: conv.unread > 0 ? 700 : 500 }}>{conv.name}</div>
                      {conv.type === "custom-group" && conv.admins?.[myId] && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: isDark ? "#2d2060" : "#ede9fe", color: "#6d28d9", textTransform: "uppercase", letterSpacing: .4 }}>Admin</span>
                      )}
                    </div>
                    <div className="tc-conv-last" style={{ color: conv.unread > 0 ? convLastUnread : undefined, fontWeight: conv.unread > 0 ? 500 : 400 }}>
                      {conv.lastMessage || "Start chatting..."}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div className="tc-conv-time">{fmtTime(conv.time)}</div>
                    {conv.unread > 0 && <span className="tc-badge">{conv.unread > 99 ? "99+" : conv.unread}</span>}
                  </div>
                </div>
              ))
            }
          </div>
        </aside>

        <main
          className="tc-main"
          style={{ position: "relative" }}
          onDragEnter={selectedChat && !editState ? handleDragEnter : undefined}
          onDragLeave={selectedChat && !editState ? handleDragLeave : undefined}
          onDragOver={selectedChat && !editState ? handleDragOver : undefined}
          onDrop={selectedChat && !editState ? handleDrop : undefined}
        >
          {isDragOver && selectedChat && !editState && (
            <div className="tc-drop-overlay">
              <div className="tc-drop-icon">
                <Paperclip size={30} color="#4f46e5" />
              </div>
              <div className="tc-drop-title">Drop files to send</div>
              <div className="tc-drop-sub">Single or multiple files supported</div>
            </div>
          )}
          {selectedChat ? (
            <>
              <header className="tc-chat-header">
                <button className="tc-icon-btn" onClick={() => { setSelectedChat(null); setEditState(null); }}><ArrowLeft size={17} /></button>
                <div
                  className={`tc-avatar sm ${selectedChat.type !== "individual" ? "group" : ""}`}
                  onClick={openDetailsPanel}
                  title="Open details"
                  style={{ cursor: "pointer" }}
                >
                  {selectedChat.type !== "individual" ? <Hash size={16} /> : selectedChat.avatar}
                </div>
                <div className="tc-header-info" onClick={openDetailsPanel} style={{ cursor: "pointer" }}>
                  <div className="tc-header-name">{selectedChat.name}</div>
                  <div className={`tc-header-sub ${selectedChat.type === "individual" ? "online" : ""}`}>
                    {selectedChat.type === "group" ? "Team Group" : selectedChat.type === "custom-group" ? `${Object.keys(selectedChat.participants || {}).length} members${onlyAdminsCanSend ? " · Admins only" : ""}` : "Active now"}
                  </div>
                </div>
                <button className="tc-icon-btn" onClick={openDetailsPanel} title="Chat details"><MoreVertical size={16} /></button>
              </header>

              {loadingMessages ? (
                <div className="tc-loading-wrap">
                  {[55, 70, 45, 65, 50].map((w, i) => <div key={i} className="tc-skel" style={{ width: `${w}%`, alignSelf: i % 2 === 0 ? "flex-start" : "flex-end", animationDelay: `${i * .1}s` }} />)}
                </div>
              ) : (
                <div className={`tc-messages-area ${messagesVisible ? "visible" : ""}`}>
                  {messages.map((msg, idx) => {
                    const isMe      = msg.senderId == myId;
                    const prev      = messages[idx - 1];
                    const showDate  = !prev || new Date(msg.time).toDateString() !== new Date(prev.time).toDateString();
                    const isGroup   = selectedChat.type !== "individual";
                    const showSender= isGroup && !isMe && (!prev || prev.senderId !== msg.senderId || showDate);
                    const isDeleted = !!msg.deleted;
                    const isSystem = msg.type === "system";
                    return (
                      <React.Fragment key={`${msg.timestamp}_${idx}`}>
                        {showDate && <div className="tc-date-sep"><span>{new Date(msg.time).toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"})}</span></div>}
                        {isSystem ? (
                          <div className="tc-system-msg">{msg.text}</div>
                        ) : (
                        <div className={`tc-msg-row ${isMe?"me":"them"}`}>
                          {!isDeleted && (
                            <MsgBubbleActions isMe={isMe} msg={msg} isDark={isDark}
                              onEdit={() => startEdit(msg)}
                              onDelete={() => promptDelete(msg)}
                            />
                          )}
                          <div className={`tc-bubble ${isMe?"me":"them"} ${isDeleted?"deleted":""}`}>
                            {showSender && !isDeleted && <div className="tc-sender-name">{msg.senderName||"Team Member"}</div>}
                            {isDeleted ? (
                              <div style={{ display:"flex", alignItems:"center", gap:7, opacity:0.6, fontStyle:"italic" }}>
                                <Trash2 size={12} color={isDark?"#6b7280":"#9ca3af"} />
                                <span style={{ fontSize:13, color: isDark?"#6b7280":"#9ca3af" }}>This message was deleted</span>
                              </div>
                            ) : (
                              <>
                                {msg.attachments?.length > 0 && <div style={{ marginBottom: msg.text ? 6 : 0 }}>{msg.attachments.map((att, i) => <MsgAttachView key={i} att={att} isMe={isMe} />)}</div>}
                                {msg.text && <div>{msg.text}</div>}
                                {msg.editedAt && <span style={{ fontSize:10, opacity:0.5, fontStyle:"italic", marginLeft:4 }}>(edited)</span>}
                              </>
                            )}
                            {!isDeleted && <div className="tc-msg-time">{fmtTime(msg.time)}</div>}
                          </div>
                        </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}

              <footer className="tc-footer">
                {showEmoji && (
                  <div className="tc-emoji-wrap">
                    <Suspense fallback={null}>
                      <EmojiPicker
                        onEmojiClick={(data) => {
                          if (editState) { setEditState((s) => s ? { ...s, text: s.text + data.emoji } : s); }
                          else { setMessageInput((p) => p+data.emoji); }
                          setShowEmoji(false);
                          (editState ? editInputRef : inputRef).current?.focus();
                        }}
                        theme={isDark ? "dark" : "light"} previewConfig={{ showPreview:false }}
                      />
                    </Suspense>
                  </div>
                )}
                {editState && (
                  <div className="tc-edit-bar">
                    <Pencil size={13} />
                    <span style={{ flex:1, fontWeight:500 }}>Editing message</span>
                    <button onClick={cancelEdit} style={{ background:"none", border:"none", cursor:"pointer", color:"inherit", display:"flex", alignItems:"center", gap:3, fontSize:12, padding:"2px 6px", borderRadius:6 }}>
                      <X size={12} /> Cancel
                    </button>
                  </div>
                )}
                {attachments.length > 0 && !editState && (
                  <div className="tc-attach-row">
                    {attachments.map((f) => <AttachThumb key={f.id} f={f} onRemove={removeAttachment} isDark={isDark} />)}
                  </div>
                )}
                {blockedByAdminOnly && !editState && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 8, borderRadius: 12, background: isDark ? "rgba(250,204,21,0.08)" : "#fffbeb", color: isDark ? "#facc15" : "#92400e", fontSize: 12.5, fontWeight: 700 }}>
                    <MessageSquareOff size={14} />
                    Only group admins can send messages in this group.
                  </div>
                )}
                <div className={`tc-input-row ${editState ? "edit-mode" : ""}`}>
                  <input type="file" multiple ref={fileInputRef} style={{ display:"none" }} onChange={handleFileSelect} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.mp4,.mp3" />
                  {!editState && <button className="tc-attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach files"><Paperclip size={16} /></button>}
                  {editState ? (
                    <input ref={editInputRef} type="text" className="tc-text-input" placeholder="Edit your message..." value={editState.text}
                      onChange={(e) => setEditState((s) => s ? { ...s, text: e.target.value } : s)} onKeyDown={handleEditKeyDown} />
                  ) : (
                    <textarea ref={inputRef} className="tc-text-input" placeholder="Type a message..." value={messageInput} rows={1}
                      onChange={(e) => { setMessageInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
                      onKeyDown={handleKeyDown}
                      onPaste={() => { setTimeout(() => { if (inputRef.current) { inputRef.current.style.height = "auto"; inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px"; } }, 0); }}
                    />
                  )}
                  <button className="tc-attach-btn" onClick={() => setShowEmoji((v) => !v)}><Smile size={16} /></button>
                  {editState ? (
                    <button className="tc-send-btn edit" onClick={editMessage} disabled={!editState.text.trim()} title="Save edit"><Check size={15} /></button>
                  ) : (
                    <button className="tc-send-btn" onClick={sendMessage} disabled={!canSend}>
                      {sending ? <Loader size={15} style={{ animation:"tc-spin 0.8s linear infinite" }} /> : <Send size={15} />}
                    </button>
                  )}
                </div>
              </footer>
            </>
          ) : (
            <div className="tc-empty">
              <div className="tc-empty-icon"><MessageCircle size={30} color="#4f46e5" strokeWidth={1.5} /></div>
              <h3>Team Chat</h3>
              <p>Select a conversation or start a new one with your team</p>
              <button className="tc-start-btn" onClick={() => setShowCanvas(true)}><Users size={16} /> New Conversation</button>
            </div>
          )}
        </main>

        <AnimatePresence>
          {showCanvas && (
            <motion.div className="tc-canvas-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={(e) => e.target===e.currentTarget && setShowCanvas(false)}>
              <motion.div className="tc-canvas" initial={{x:340}} animate={{x:0}} exit={{x:340}} transition={{type:"spring",stiffness:300,damping:30}}>
                <div className="tc-canvas-header">
                  <div className="tc-canvas-title">New Conversation</div>
                  <button className="tc-canvas-close" onClick={() => setShowCanvas(false)}><X size={15} /></button>
                </div>
                <div className="tc-canvas-search-wrap">
                  <Search size={14} style={{ position:"absolute", left:28, top:"50%", transform:"translateY(-50%)", color:searchIcon }} />
                  <input type="text" className="tc-canvas-search" placeholder="Search people or groups..." value={canvasSearch2} onChange={(e) => setCanvasSearch2(e.target.value)} autoFocus />
                </div>
                <div className="tc-canvas-body">
                  <div className="tc-section-label">Team Groups</div>
                  {filteredTeams.length===0 ? <div className="tc-no-list">No groups found</div>
                    : filteredTeams.map((team) => (
                      <div key={`g-${team.id}`} className="tc-canvas-item" onClick={() => openChatWith({...team,type:"group",avatar:team.name.substring(0,2).toUpperCase(),chatKey:`group_${team.id}`})}>
                        <div className="tc-avatar group" style={{width:44,height:44,fontSize:14}}><Hash size={17} /></div>
                        <div className="tc-canvas-item-info"><h6>{team.name}</h6><p>{team.members?.length||0} members</p></div>
                      </div>
                    ))
                  }
                  <div style={{ height:1, background:sidebarBorder, margin:"8px 0" }} />
                  <div className="tc-section-label">Team Members</div>
                  {filteredAgents.length===0 ? <div className="tc-no-list">No members found</div>
                    : filteredAgents.map((agent) => (
                      <div key={`a-${agent.id}`} className="tc-canvas-item" onClick={() => openChatWith({...agent,type:"individual",avatar:agent.name.substring(0,2).toUpperCase(),chatKey:`individual_${agent.id}`})}>
                        <div className="tc-avatar" style={{width:44,height:44,fontSize:14}}>{agent.name.substring(0,2).toUpperCase()}</div>
                        <div className="tc-canvas-item-info"><h6>{agent.name}</h6><p>Individual chat</p></div>
                      </div>
                    ))
                  }
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showDetailsPanel && selectedChat && (
            <motion.div
              className="tc-details-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => e.target === e.currentTarget && setShowDetailsPanel(false)}
            >
              <motion.aside
                className="tc-details-panel"
                initial={{ x: 390 }}
                animate={{ x: 0 }}
                exit={{ x: 390 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                <div className="tc-canvas-header">
                  <div className="tc-canvas-title">{selectedChat.type === "individual" ? "Agent Details" : "Group Details"}</div>
                  <button className="tc-canvas-close" onClick={() => setShowDetailsPanel(false)}><X size={15} /></button>
                </div>

                <div className="tc-canvas-body" style={{ padding: 18 }}>
                  {selectedChat.type === "individual" ? (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 0 22px" }}>
                        <div className="tc-avatar" style={{ width: 82, height: 82, fontSize: 24, marginBottom: 12 }}>
                          {initials((profileAgent || selectedChat)?.name)}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: headerName, textAlign: "center" }}>
                          {(profileAgent || selectedChat)?.name || "Agent"}
                        </div>
                        <div style={{ fontSize: 12.5, color: headerSub, marginTop: 4, textAlign: "center" }}>
                          Individual chat profile
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div className="tc-detail-row">
                          <Info size={17} color="#4f46e5" />
                          <div>
                            <div className="tc-detail-label">Name</div>
                            <div className="tc-detail-value">{(profileAgent || selectedChat)?.name || "—"}</div>
                          </div>
                        </div>
                        <div className="tc-detail-row">
                          <Mail size={17} color="#4f46e5" />
                          <div>
                            <div className="tc-detail-label">Email</div>
                            <div className="tc-detail-value">{(profileAgent || selectedChat)?.email || "—"}</div>
                          </div>
                        </div>
                        <div className="tc-detail-row">
                          <Phone size={17} color="#4f46e5" />
                          <div>
                            <div className="tc-detail-label">SIP</div>
                            <div className="tc-detail-value">{getAgentSip(profileAgent || selectedChat)}</div>
                          </div>
                        </div>
                        <div className="tc-detail-row">
                          <Hash size={17} color="#4f46e5" />
                          <div>
                            <div className="tc-detail-label">Assigned DID Number</div>
                            <div className="tc-detail-value">{getAgentDid(profileAgent || selectedChat)}</div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 0 20px" }}>
                        <div className="tc-avatar group" style={{ width: 82, height: 82, fontSize: 24, marginBottom: 12 }}>
                          <Hash size={28} />
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: headerName, textAlign: "center" }}>{selectedChat.name}</div>
                        <div style={{ fontSize: 12.5, color: headerSub, marginTop: 4, textAlign: "center" }}>
                          {selectedChat.type === "custom-group" ? "Custom Group" : "Team Group"} · {selectedGroupMembers.length} participants
                        </div>
                      </div>

                      {selectedChat.type === "custom-group" && (
                        <div className="tc-setting-card" style={{ marginBottom: 16 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Settings size={17} color="#4f46e5" />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 800, color: headerName }}>Only admins can send messages</div>
                              <div style={{ fontSize: 12, color: headerSub, marginTop: 2 }}>
                                Turn this on to make the group announcement-only.
                              </div>
                            </div>
                            <label style={{ display: "inline-flex", alignItems: "center", cursor: iAmSelectedGroupAdmin ? "pointer" : "not-allowed", opacity: iAmSelectedGroupAdmin ? 1 : .55 }}>
                              <input
                                type="checkbox"
                                checked={!!selectedChat.settings?.onlyAdminsCanSend}
                                disabled={!iAmSelectedGroupAdmin || adminActionLoading === "only-admin-send"}
                                onChange={(e) => toggleOnlyAdminsCanSend(e.target.checked)}
                                style={{ width: 18, height: 18, accentColor: "#4f46e5", cursor: "inherit" }}
                              />
                            </label>
                          </div>
                          {!iAmSelectedGroupAdmin && (
                            <div style={{ marginTop: 10, fontSize: 11.5, color: headerSub }}>
                              Only group admin can change this setting.
                            </div>
                          )}
                        </div>
                      )}

                      {selectedChat.type === "custom-group" && iAmSelectedGroupAdmin && (
                        <div className="tc-setting-card" style={{ marginBottom: 16, borderColor: "rgba(239,68,68,.24)", background: isDark ? "rgba(239,68,68,.07)" : "rgba(254,242,242,.75)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Trash2 size={17} color="#ef4444" />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 800, color: headerName }}>Delete group for everyone</div>
                              <div style={{ fontSize: 12, color: headerSub, marginTop: 2 }}>
                                The group disappears for every participant. A record stays soft-deleted in the database.
                              </div>
                            </div>
                            <button
                              className="tc-action-chip"
                              onClick={deleteCustomGroupForEveryone}
                              disabled={!!adminActionLoading}
                              style={{ background: "rgba(239,68,68,.12)", color: "#ef4444", padding: "8px 10px" }}
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedChat.type === "custom-group" && (
                        <div className="tc-setting-card" style={{ marginBottom: 16 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <LogOut size={17} color="#ef4444" />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 800, color: headerName }}>Leave group</div>
                              <div style={{ fontSize: 12, color: headerSub, marginTop: 2 }}>
                                You can leave this group. A leave message will show in the chat.
                              </div>
                            </div>
                            <button
                              className="tc-action-chip"
                              onClick={leaveCustomGroup}
                              disabled={!!adminActionLoading}
                              style={{ background: "rgba(239,68,68,.10)", color: "#ef4444", padding: "8px 10px" }}
                            >
                              <LogOut size={12} /> Leave
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedChat.type === "custom-group" && iAmSelectedGroupAdmin && (
                        <div className="tc-setting-card" style={{ marginBottom: 16 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <UserPlus size={17} color="#4f46e5" />
                            <div>
                              <div style={{ fontSize: 13.5, fontWeight: 800, color: headerName }}>Add participants</div>
                              <div style={{ fontSize: 12, color: headerSub, marginTop: 2 }}>Adding a member posts a system message in the chat.</div>
                            </div>
                          </div>
                          <div style={{ position: "relative", marginBottom: 8 }}>
                            <Search size={14} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: searchIcon }} />
                            <input
                              className="tc-canvas-search"
                              placeholder="Search agents to add..."
                              value={groupAddSearch}
                              onChange={(e) => setGroupAddSearch(e.target.value)}
                              style={{ paddingLeft: 36 }}
                            />
                          </div>
                          {groupAddSearch.trim() && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 230, overflowY: "auto" }}>
                              {addableGroupAgents.length === 0 ? (
                                <div className="tc-no-list" style={{ padding: "10px 0" }}>No agents available to add</div>
                              ) : addableGroupAgents.map((agent) => (
                                <div key={`add-${agent.id}`} className="tc-member-row">
                                  <div className="tc-avatar sm" style={{ width: 34, height: 34, fontSize: 11 }}>{initials(agent.name)}</div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 750, color: headerName, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.name}</div>
                                    <div style={{ fontSize: 11.5, color: headerSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.email || "Agent"}</div>
                                  </div>
                                  <button
                                    className="tc-action-chip"
                                    onClick={() => addGroupMember(agent)}
                                    disabled={!!adminActionLoading}
                                    style={{ background: isDark ? "rgba(79,70,229,.16)" : "#eef2ff", color: "#4f46e5" }}
                                  >
                                    <UserPlus size={12} /> Add
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ position: "relative", marginBottom: 10 }}>
                        <Search size={14} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: searchIcon }} />
                        <input
                          className="tc-canvas-search"
                          placeholder="Search participants..."
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          style={{ paddingLeft: 36 }}
                        />
                      </div>

                      <div className="tc-section-label" style={{ paddingLeft: 0 }}>
                        Participants · {filteredGroupMembers.length}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {filteredGroupMembers.length === 0 ? (
                          <div className="tc-no-list">No participants found</div>
                        ) : filteredGroupMembers.map((member) => {
                          const isAdmin = selectedChat.type === "custom-group" && !!selectedChat.admins?.[member.id];
                          const isMeMember = String(member.id) === String(myId);
                          const canManageThisMember = selectedChat.type === "custom-group" && iAmSelectedGroupAdmin && !isMeMember;
                          return (
                            <div key={`member-${member.id}`} className="tc-member-row">
                              <div className="tc-avatar sm" style={{ width: 38, height: 38, fontSize: 12 }}>
                                {initials(member.name)}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ fontSize: 13.5, fontWeight: 750, color: headerName, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {member.name || "Team Member"} {isMeMember ? "(You)" : ""}
                                  </div>
                                  {isAdmin && (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 800, color: "#d97706", background: isDark ? "rgba(217,119,6,.14)" : "#fef3c7", padding: "2px 6px", borderRadius: 999 }}>
                                      <Crown size={10} /> Admin
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 12, color: headerSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {member.email || "Group participant"}
                                </div>
                              </div>

                              {canManageThisMember && (
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                  {isAdmin ? (
                                    <button
                                      className="tc-action-chip"
                                      onClick={() => removeGroupAdmin(member)}
                                      disabled={!!adminActionLoading}
                                      style={{ background: isDark ? "rgba(255,255,255,.06)" : "#f3f4f6", color: isDark ? "#c0c0d8" : "#374151" }}
                                      title="Remove admin"
                                    >
                                      <ShieldCheck size={12} /> Admin
                                    </button>
                                  ) : (
                                    <button
                                      className="tc-action-chip"
                                      onClick={() => makeGroupAdmin(member)}
                                      disabled={!!adminActionLoading}
                                      style={{ background: isDark ? "rgba(79,70,229,.16)" : "#eef2ff", color: "#4f46e5" }}
                                    >
                                      <Crown size={12} /> Make admin
                                    </button>
                                  )}
                                  <button
                                    className="tc-action-chip"
                                    onClick={() => removeGroupMember(member)}
                                    disabled={!!adminActionLoading}
                                    style={{ background: "rgba(239,68,68,.10)", color: "#ef4444" }}
                                  >
                                    <UserMinus size={12} /> Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showCreateGroup && (
            <motion.div className="tc-canvas-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              onClick={(e) => e.target===e.currentTarget && setShowCreateGroup(false)}
              style={{ backdropFilter:"blur(8px)", background:isDark?"rgba(5,5,10,0.65)":"rgba(15,23,42,0.45)", zIndex:9999, justifyContent:"center", alignItems:"center" }}>
              <motion.div initial={{scale:.94,opacity:0,y:20}} animate={{scale:1,opacity:1,y:0}} exit={{scale:.94,opacity:0,y:20}} transition={{type:"spring",stiffness:260,damping:24}}
                style={{ width:"100%", maxWidth:520, height:"85vh", background: isDark?"rgba(17,17,24,0.98)":"rgba(255,255,255,0.96)", borderRadius:28, overflow:"hidden", display:"flex", flexDirection:"column", boxShadow: isDark?"0 24px 80px rgba(0,0,0,0.60)":"0 24px 80px rgba(0,0,0,0.22)", border: isDark?"1px solid rgba(255,255,255,0.06)":"1px solid rgba(255,255,255,0.5)" }}>
                <div style={{ padding:"22px 24px 18px", borderBottom:`1px solid ${sidebarBorder}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:21, fontWeight:700, color:headerName, letterSpacing:"-.4px" }}>Create Group</div>
                    <div style={{ fontSize:13, color:headerSub, marginTop:4 }}>Add teammates and start collaborating</div>
                  </div>
                  <button onClick={() => setShowCreateGroup(false)} style={{ width:38, height:38, borderRadius:14, border:"none", background: isDark?"#1e1e2a":"#f8fafc", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <X size={17} color={iconBtn} />
                  </button>
                </div>
                <div style={{ padding:"18px 24px 0" }}>
                  <input placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} style={{ width:"100%", height:50, borderRadius:16, border:`1px solid ${isDark?"#2a2a3a":"#e2e8f0"}`, padding:"0 16px", fontSize:14, outline:"none", marginBottom:14, background:isDark?"#1a1a24":"#fff", fontFamily:"DM Sans, sans-serif", color:textInput }} />
                  <div style={{ position:"relative" }}>
                    <Search size={16} style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:searchIcon }} />
                    <input placeholder="Search participants..." value={participantSearch} onChange={(e) => setParticipantSearch(e.target.value)} style={{ width:"100%", height:50, borderRadius:16, border:`1px solid ${isDark?"#2a2a3a":"#e2e8f0"}`, padding:"0 16px 0 42px", fontSize:14, outline:"none", background:isDark?"#1a1a24":"#fff", fontFamily:"DM Sans, sans-serif", color:textInput }} />
                  </div>
                </div>
                {selectedParticipants.length > 0 && (
                  <div style={{ padding:"16px 24px 0" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:headerSub, textTransform:"uppercase", marginBottom:10, letterSpacing:.5 }}>Selected Members</div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {selectedParticipants.map((p) => (
                        <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, background:isDark?"#1e1e30":"#eef2ff", borderRadius:999, padding:"7px 12px 7px 8px" }}>
                          <div className="tc-avatar sm" style={{ width:28, height:28, fontSize:11 }}>{p.name.substring(0,2).toUpperCase()}</div>
                          <span style={{ fontSize:12.5, fontWeight:500, color:isDark?"#a5b4fc":"#3730a3" }}>{p.name}</span>
                          <button onClick={() => setSelectedParticipants((prev) => prev.filter((x) => x.id!==p.id))} style={{ border:"none", background:"transparent", cursor:"pointer", display:"flex", padding:0 }}><X size={14} color="#6366f1" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ flex:1, overflowY:"auto", padding:"18px 18px 0" }}>
                  {agents.filter((a) => a.name.toLowerCase().includes(participantSearch.toLowerCase())).map((agent) => {
                    const sel = selectedParticipants.find((p) => p.id===agent.id);
                    return (
                      <motion.div key={agent.id} whileTap={{scale:.98}}
                        onClick={() => sel ? setSelectedParticipants((p) => p.filter((x) => x.id!==agent.id)) : setSelectedParticipants((p) => [...p,agent])}
                        style={{ display:"flex", alignItems:"center", gap:14, padding:14, borderRadius:18, cursor:"pointer", marginBottom:8, transition:"all .15s ease", border: sel ? `1px solid ${isDark?"#4f46e5":"#c7d2fe"}` : `1px solid ${isDark?"#1e1e2a":"transparent"}`, background: sel ? (isDark?"#1e1e30":"#eef2ff") : (isDark?"#16161f":"#fff") }}>
                        <div className="tc-avatar" style={{ width:46, height:46, fontSize:14 }}>{agent.name.substring(0,2).toUpperCase()}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14, fontWeight:600, color:canvasItemH6 }}>{agent.name}</div>
                          <div style={{ fontSize:12, color:headerSub, marginTop:2 }}>Team Member</div>
                        </div>
                        <div style={{ width:22, height:22, borderRadius:999, border: sel?`6px solid #4f46e5`:`2px solid ${isDark?"#2a2a3a":"#d1d5db"}`, transition:"all .15s ease" }} />
                      </motion.div>
                    );
                  })}
                </div>
                <div style={{ padding:20, borderTop:`1px solid ${sidebarBorder}`, background: isDark?"rgba(17,17,24,0.95)":"linear-gradient(to top,#fff,rgba(255,255,255,.92))", display:"flex", gap:12 }}>
                  <button onClick={() => setShowCreateGroup(false)} style={{ flex:1, height:50, borderRadius:16, border:`1px solid ${isDark?"#2a2a3a":"#e2e8f0"}`, background:isDark?"#1a1a24":"#fff", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"DM Sans, sans-serif", color:textInput }}>Cancel</button>
                  <button onClick={createCustomGroup} disabled={!groupName.trim()||!selectedParticipants.length} style={{ flex:1.2, height:50, borderRadius:16, border:"none", background:!groupName.trim()||!selectedParticipants.length?(isDark?"#2a2a3e":"#cbd5e1"):"#4f46e5", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", transition:"all .15s ease", fontFamily:"DM Sans, sans-serif" }}>Create Group</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
