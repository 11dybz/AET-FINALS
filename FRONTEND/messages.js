// Inbox and thread state stays in memory and is discarded on logout/navigation.
let chatConversations = [], chatInboxFilter = 'all', chatListLoading = false, chatListLoaded = false;
let chatListError = '', chatListRequest = 0, chatThreadReady = false, chatReturnMode = 'swipe';
const chatDrafts = new Map();
const chatElement = id => document.getElementById(id);
const compactChat = () => Boolean(window.matchMedia?.('(max-width:760px)')?.matches);
function syncChatNavigation() {
  document.querySelectorAll('.rz-topbar, .rz-mobile-nav, .rz-sidebar').forEach(view => { view.inert = chatOpen && compactChat(); });
}

function setChatThreadState(title, text, retry = false) {
  const state = chatElement('threadState'); state.hidden = false;
  chatElement('threadStateTitle').textContent = title;
  chatElement('threadStateText').textContent = text;
  chatElement('threadLoadRetry').hidden = !retry;
}

function syncChatComposer() {
  const composer = chatElement('chatComposer');
  composer.disabled = !chatThreadReady || chatSending;
  chatElement('chatSendButton').disabled = composer.disabled || !composer.value.trim();
  chatElement('chatVideoButton').disabled = !chatThreadReady;
  chatElement('chatMapButton').disabled = !chatThreadReady;
}

function conversationEmpty(title, text, label, action) {
  const empty = document.createElement('div'); empty.className = 'ms-inbox-empty';
  const mark = document.createElement('span'); mark.className = 'ms-empty-mark'; mark.textContent = '…'; mark.setAttribute('aria-hidden','true');
  const heading = document.createElement('h4'); heading.textContent = title;
  const description = document.createElement('p'); description.textContent = text;
  empty.append(mark,heading,description);
  if (label) { const button = document.createElement('button'); button.type = 'button'; button.className = 'ms-text-button'; button.textContent = label; button.onclick = action; empty.appendChild(button); }
  return empty;
}

function filterConversations(filter) {
  if (filter === 'all' || filter === 'unread') chatInboxFilter = filter;
  renderConversations();
}

function renderConversations() {
  const list = chatElement('conversationList'), scrollTop = list.scrollTop; list.replaceChildren();
  const query = String(chatElement('conversationSearch').value || '').trim().toLowerCase();
  const unread = chatConversations.filter(c => Number(c.unreadCount) > 0).length;
  chatElement('inboxAll').setAttribute('aria-pressed', String(chatInboxFilter === 'all'));
  chatElement('inboxUnread').setAttribute('aria-pressed', String(chatInboxFilter === 'unread'));
  chatElement('inboxUnreadCount').hidden = !unread; chatElement('inboxUnreadCount').textContent = String(unread);
  chatElement('inboxCount').textContent = !chatListLoaded ? chatListLoading ? 'Loading your connections…' : 'Your conversations' : `${chatConversations.length} conversation${chatConversations.length === 1 ? '' : 's'}`;
  chatElement('inboxNotice').hidden = !chatListError || !chatConversations.length;
  chatElement('inboxNoticeText').textContent = chatListError;
  if (chatListLoading && !chatListLoaded) {
    const loading = document.createElement('div'); loading.className = 'ms-list-loading'; loading.setAttribute('role','status');
    const label = document.createElement('span'); label.className = 'ms-sr-only'; label.textContent = 'Loading conversations'; loading.appendChild(label);
    for (let i = 0; i < 4; i++) { const row = document.createElement('div'); row.className = 'ms-skeleton-row'; row.setAttribute('aria-hidden','true'); row.innerHTML = '<span></span><div><i></i><i></i></div>'; loading.appendChild(row); }
    list.appendChild(loading);
  } else if (chatListError && !chatConversations.length) {
    list.appendChild(conversationEmpty('Let’s reconnect','Your conversations could not load. Your messages are still there.','Try again',() => loadConversations()));
  } else {
    const filtered = chatConversations.filter(c => (chatInboxFilter !== 'unread' || Number(c.unreadCount) > 0)
      && [c.profile.name,c.profile.role,c.lastMessage?.body].some(value => String(value || '').toLowerCase().includes(query)));
    if (!filtered.length) {
      list.appendChild(query ? conversationEmpty('No conversations found','Try another name, skill, or message.','Clear search',() => { chatElement('conversationSearch').value = ''; filterConversations(); })
        : chatInboxFilter === 'unread' ? conversationEmpty('You’re all caught up','No unread messages. Your other connections are a tap away.','Show all messages',() => filterConversations('all'))
        : conversationEmpty('A fresh start','When you connect with someone, your conversations will appear here.','Discover people',discoverFromMessages));
    }
    filtered.forEach(conversation => {
      const profile = conversation.profile, selected = profile.id === chatProfileId;
      const row = document.createElement('button'); row.type = 'button'; row.className = 'ms-conversation';
      if (selected) row.setAttribute('aria-current','true');
      row.setAttribute('aria-label', `Message ${profile.name}${conversation.unreadCount > 0 ? ', '+conversation.unreadCount+' unread' : ''}`);
      row.onclick = () => openChatThread(profile.id);
      const avatar = document.createElement('span'); avatar.className = 'ms-conversation-avatar';
      const fallback = document.createElement('span'); fallback.textContent = String(profile.name || '?').trim().slice(0,1).toUpperCase();
      const img = document.createElement('img'); img.src = safeImageUrl(profile.images?.[0]?.url || profile.image); img.alt = ''; img.loading = 'lazy';
      img.onerror = () => { img.hidden = true; }; if (!img.src) img.hidden = true;
      avatar.append(fallback,img);
      const copy = document.createElement('span'); copy.className = 'ms-conversation-copy';
      const name = document.createElement('strong'); name.textContent = profile.name;
      const preview = document.createElement('span'); preview.textContent = conversation.lastMessage?.body || 'Say hello and start something great.';
      if (conversation.unreadCount > 0) copy.classList.add('ms-is-unread'); copy.append(name,preview);
      const meta = document.createElement('span'); meta.className = 'ms-conversation-meta';
      const date = conversation.lastMessage?.createdAt && new Date(conversation.lastMessage.createdAt);
      if (date && !Number.isNaN(date.getTime())) {
        const time = document.createElement('time'); time.dateTime = date.toISOString();
        time.textContent = date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : date.toLocaleDateString([], {month:'short',day:'numeric'}); meta.appendChild(time);
      }
      if (conversation.unreadCount > 0) { const count = document.createElement('span'); count.className = 'ms-unread-badge'; count.textContent = conversation.unreadCount > 99 ? '99+' : String(conversation.unreadCount); meta.appendChild(count); }
      row.append(avatar,copy,meta); list.appendChild(row);
    });
  }
  list.scrollTop = scrollTop;
  if (chatListError && !chatConversations.length) {
    chatElement('inboxWelcomeTitle').textContent = 'Your next conversation is waiting.';
    chatElement('inboxWelcomeText').textContent = 'Reconnect to load your connections and pick up where you left off.';
  } else {
    chatElement('inboxWelcomeTitle').textContent = chatConversations.length ? 'Pick up where you left off.' : 'Good things start with a conversation.';
    chatElement('inboxWelcomeText').textContent = chatConversations.length ? 'Choose a connection from your inbox. A great idea might be one message away.' : 'Find someone who clicks. Share an idea. Build something great together.';
  }
}

async function loadConversations() {
  if (!chatOpen || chatListLoading) return;
  const request = ++chatListRequest; chatListLoading = true; renderConversations();
  try {
    const conversations = await apiCall('/me/conversations','GET',undefined,{admin:false});
    if (!chatOpen || request !== chatListRequest) return;
    if (!Array.isArray(conversations)) throw new Error('Could not load conversations.');
    chatConversations = conversations.filter(c => c?.profile?.id && !isOwnProfile(c.profile.id)); chatListLoaded = true; chatListError = '';
    const unreadTotal = chatConversations.reduce((total,c) => total + Number(c.unreadCount || 0),0);
    ['messagesUnreadBadge','sidebarMessageCount'].forEach(id => { const badge = chatElement(id); if (badge) { badge.textContent = unreadTotal > 99 ? '99+' : String(unreadTotal); badge.hidden = !unreadTotal; badge.classList.toggle('hidden',!unreadTotal); } });
  } catch (error) {
    if (!chatOpen || request !== chatListRequest) return;
    chatListError = 'Could not refresh your inbox. Try again.';
  } finally {
    if (request === chatListRequest) { chatListLoading = false; if (chatOpen) renderConversations(); }
  }
}

function syncRemovedMatch(profileId) {
  // Ignore an inbox response started before removal so it cannot restore the connection.
  chatListRequest++; chatListLoading = false;
  chatConversations = chatConversations.filter(conversation => conversation.profile.id !== profileId);
  if (chatProfileId === profileId) {
    if (chatOpen) showConversationList();
    else { chatGeneration++; chatProfileId = null; chatThreadReady = false; }
  }
  const unread = chatConversations.reduce((total, conversation) => total + Number(conversation.unreadCount || 0), 0);
  ['messagesUnreadBadge','sidebarMessageCount'].forEach(id => {
    const badge = chatElement(id);
    if (badge) { badge.textContent = unread > 99 ? '99+' : String(unread); badge.hidden = !unread; badge.classList.toggle('hidden', !unread); }
  });
  if (chatOpen) renderConversations();
}

function rememberChatDraft() {
  if (chatProfileId) chatDrafts.set(chatProfileId,chatElement('chatComposer').value || '');
}

async function openChat(profileId) {
  if (profileId && isOwnProfile(profileId)) return showToast('Your profile','You cannot message yourself.');
  if (profileId && !matchedProfiles.some(p => p.id === profileId)) return showToast('Match first','Like this profile before sending a message.');
  if (chatOpen && !profileId) { showConversationList(); return; }
  if (!chatOpen) {
    chatLastFocused = document.activeElement;
    try { chatReturnMode = sessionStorage.getItem('rizzumeMode') || 'swipe'; } catch (_) {}
  }
  rememberChatDraft(); chatOpen = true; chatGeneration++; chatListRequest++; chatListLoading = false;
  chatElement('chatSheet').classList.remove('hidden'); document.body.classList.add('messages-open');
  ['homeScreen','swipeAppScreen','directoryScreen','fullProfileScreen','discoveryHeading','discoveryTip'].forEach(id => { const view = chatElement(id); if (view) view.inert = true; });
  syncChatNavigation();
  window.RizzumeExperience?.navigated('messages');
  if (profileId) openChatThread(profileId); else showConversationList();
  lucide.createIcons(); startChatPolling(); await loadConversations();
}

function showConversationList() {
  rememberChatDraft(); chatGeneration++; chatProfileId = null; chatThreadReady = false;
  chatElement('chatSheet').dataset.thread = 'false';
  chatElement('threadView').classList.add('hidden'); chatElement('chatPlaceholder').hidden = false;
  renderConversations();
  // Do not summon a mobile keyboard merely by opening an empty inbox.
  chatElement('chatBackButton').focus();
}

function closeChat() {
  rememberChatDraft(); chatGeneration++; chatListRequest++; chatListLoading = false; chatOpen = false; chatProfileId = null; chatThreadReady = false;
  stopChatPolling(); chatElement('chatSheet').classList.add('hidden'); document.body.classList.remove('messages-open');
  ['homeScreen','swipeAppScreen','directoryScreen','fullProfileScreen','discoveryHeading','discoveryTip'].forEach(id => { const view = chatElement(id); if (view) view.inert = false; });
  syncChatNavigation();
  window.RizzumeExperience?.navigated(chatReturnMode);
  chatLastFocused?.focus?.();
}

function discoverFromMessages() { closeChat(); startMode('swipe'); }
async function openChatForProfile(profileId) { toggleMatchesDrawer(false); await openChat(profileId); }

async function openChatThread(profileId) {
  if (isOwnProfile(profileId)) return showToast('Your profile','You cannot message yourself.');
  if (!chatOpen) return;
  if (chatProfileId === profileId && chatThreadReady) { if (!compactChat()) chatElement('chatComposer').focus(); return; }
  rememberChatDraft(); const generation = ++chatGeneration;
  chatProfileId = profileId; chatAfterId = 0; chatFailedPayload = null; chatThreadReady = false;
  const composer = chatElement('chatComposer'); composer.value = chatDrafts.get(profileId) || ''; chatComposerInput();
  chatElement('chatError').classList.add('hidden'); chatElement('threadLoadNotice').hidden = true;
  const profile = chatConversations.find(c => c.profile.id === profileId)?.profile || matchedProfiles.find(p => p.id === profileId) || PROFILES.find(p => p.id === profileId);
  chatProfileName = profile?.name || 'Your connection';
  chatElement('chatTitle').textContent = chatProfileName; chatElement('chatSubtitle').textContent = profile?.role || 'Your connection on Rizzume';
  const avatar = chatElement('chatAvatar'); avatar.src = safeImageUrl(profile?.images?.[0]?.url || profile?.image); avatar.hidden = !avatar.src; avatar.onerror = () => { avatar.hidden = true; };
  chatElement('chatAvatarFallback').textContent = chatProfileName.trim().slice(0,1).toUpperCase();
  chatElement('chatSheet').dataset.thread = 'true'; chatElement('threadView').classList.remove('hidden'); chatElement('chatPlaceholder').hidden = true;
  const log = chatElement('messageLog'); log.replaceChildren(); log.dataset.lastDay = '';
  setChatThreadState('Loading your conversation…','Getting everything ready.'); syncChatComposer(); renderConversations();
  await pollChatMessages(true);
  if (!chatOpen || generation !== chatGeneration) return;
  if (chatThreadReady) {
    if (!compactChat()) composer.focus();
    try { await apiCall(`/me/conversations/${encodeURIComponent(profileId)}/read`,'POST',undefined,{admin:false}); } catch (_) {}
    if (chatOpen && generation === chatGeneration) loadConversations();
  }
}

async function pollChatMessages(initial = false) {
  if (!chatOpen || !chatProfileId || document.hidden) return;
  const profileId = chatProfileId, generation = chatGeneration;
  if (chatPolls.has(generation)) return;
  chatPolls.add(generation);
  try {
    const log = chatElement('messageLog'), nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    const messages = await apiCall(`/me/conversations/${encodeURIComponent(profileId)}/messages?afterId=${chatAfterId}`,'GET',undefined,{admin:false});
    if (!chatOpen || generation !== chatGeneration) return;
    if (!Array.isArray(messages)) throw new Error('Could not load messages.');
    chatThreadReady = true; chatElement('threadLoadNotice').hidden = true;
    if (messages.length) {
      chatElement('threadState').hidden = true;
      let lastDay = log.dataset.lastDay || '';
      for (const message of messages) {
        if (log.querySelector(`[data-message-id="${Number(message.id)}"]`)) continue;
        const day = new Date(message.createdAt).toLocaleDateString();
        if (day !== lastDay) { const separator = document.createElement('div'); separator.className = 'ms-date-separator'; separator.textContent = day; log.appendChild(separator); lastDay = day; log.dataset.lastDay = day; }
        const bubble = document.createElement('div'); bubble.className = 'ms-bubble '+(message.sender === 'visitor' ? 'ms-outgoing' : 'ms-incoming'); bubble.dataset.messageId = String(message.id);
        const body = document.createElement('p');
        if (window.RizzumeUI?.messageBody) window.RizzumeUI.messageBody(body,message.body); else body.textContent = message.body;
        const time = document.createElement('time'); time.textContent = new Date(message.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
        bubble.append(body,time); log.appendChild(bubble); chatAfterId = Math.max(chatAfterId,Number(message.id));
      }
      if (initial || nearBottom) scrollChatToBottom(true); else chatElement('newMessagesPill').classList.remove('hidden');
      if (messages.some(message => message.sender === 'member')) {
        try { await apiCall(`/me/conversations/${encodeURIComponent(profileId)}/read`,'POST',undefined,{admin:false}); } catch (_) {}
        if (chatOpen && generation === chatGeneration) loadConversations();
      }
    } else if (chatAfterId === 0) setChatThreadState('A new connection. A fresh conversation.','Say hello to '+chatProfileName+'. Share an idea or ask what they’re working on.');
  } catch (error) {
    if (!chatOpen || generation !== chatGeneration) return;
    if (chatAfterId === 0) { chatThreadReady = false; setChatThreadState('Let’s reconnect','Your conversation could not load. Try again in a moment.',true); }
    else chatElement('threadLoadNotice').hidden = false;
  } finally { chatPolls.delete(generation); if (generation === chatGeneration) syncChatComposer(); }
}

function scrollChatToBottom() { const log = chatElement('messageLog'); log.scrollTop = log.scrollHeight; chatElement('newMessagesPill').classList.add('hidden'); }
function startChatPolling() { stopChatPolling(); chatPollTimer = setInterval(() => { if (chatOpen && !document.hidden) { if (chatProfileId) pollChatMessages(); else loadConversations(); } },4000); }
function stopChatPolling() { if (chatPollTimer) clearInterval(chatPollTimer); chatPollTimer = null; }

function chatComposerInput() {
  const composer = chatElement('chatComposer'); composer.style.height = 'auto'; composer.style.height = Math.min(composer.scrollHeight || 44,128)+'px';
  chatElement('chatCharacterCount').textContent = String(composer.value.length); syncChatComposer();
}
function chatComposerKeydown(event) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendChatMessage(); } }

async function sendChatMessage() {
  if (!chatProfileId || !chatThreadReady || chatSending) return;
  const composer = chatElement('chatComposer'), body = composer.value.trim();
  if (!body) return;
  if (body.length > 1000) return showToast('Message too long','Use 1000 characters or fewer.');
  const profileId = chatProfileId, generation = chatGeneration;
  chatSending = true; syncChatComposer(); chatElement('chatError').classList.add('hidden');
  const optimistic = appendOptimisticMessage(body);
  try {
    await apiCall(`/me/conversations/${encodeURIComponent(profileId)}/messages`,'POST',{body},{admin:false});
    optimistic.remove(); chatDrafts.delete(profileId);
    // A visitor can leave and reopen this thread while the send is pending.
    // Clear the confirmed old draft only; never clear another thread's composer.
    if (chatOpen && chatProfileId === profileId && composer.value.trim() === body) { composer.value = ''; chatComposerInput(); }
    if (!chatOpen || generation !== chatGeneration) { if (chatOpen && chatProfileId === profileId) pollChatMessages(); return; }
    chatFailedPayload = null; composer.value = ''; chatComposerInput(); await pollChatMessages(); loadConversations();
  } catch (error) {
    optimistic.remove();
    if (!chatOpen || generation !== chatGeneration) return;
    chatFailedPayload = body; chatElement('chatErrorText').textContent = error.message || 'Could not send message'; chatElement('chatError').classList.remove('hidden');
    if (chatAfterId === 0) setChatThreadState('Your hello is ready when you are.','Your draft is safe. Retry sending when your connection is back.');
  } finally { chatSending = false; syncChatComposer(); }
}
function appendOptimisticMessage(body) {
  chatElement('threadState').hidden = true;
  const bubble = document.createElement('div'); bubble.className = 'ms-bubble ms-outgoing ms-pending';
  const text = document.createElement('p'); text.textContent = body;
  const status = document.createElement('span'); status.textContent = 'Sending…'; bubble.append(text,status);
  chatElement('messageLog').appendChild(bubble); scrollChatToBottom(true); return bubble;
}
async function retryChatSend() { if (!chatFailedPayload) return; chatElement('chatComposer').value = chatFailedPayload; await sendChatMessage(); }
document.addEventListener('visibilitychange',() => { if (chatOpen && !document.hidden) { if (chatProfileId) pollChatMessages(); else loadConversations(); } });
window.addEventListener('resize',syncChatNavigation);
document.addEventListener('keydown',event => { if (event.key === 'Escape' && chatOpen && !document.querySelector('dialog[open], .rz-dialog:not([hidden])')) closeChat(); });
