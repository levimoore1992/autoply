import { JobSearchSection } from './components/JobSearchSection';
import React, { useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  User,
  Settings as SettingsIcon,
  History,
} from 'lucide-react';
import type { Profile } from '../types';

// Zustand
import { useAppStore } from './store';

// React Query

import {
  useExtensionData,
  useCurrentTabUrl,
  useGenerateDocuments,
  useSaveProfile,
  useImportProfile,
  useDeleteApplication,
  useUpdateConfig,
  useBulkAdd,
  useBulkProcess,
  useMapFields,
  useDownloadDocument,
  useSendChatMessage,
} from './hooks';
import { Providers } from './providers';

// Components
import { ToastProvider, useToast } from './components/Toast';
import { ConfirmProvider, useConfirm } from './components/ConfirmDialog';
import { ConnectionBanner, Header } from './components/Header';
import { LoadingState, QuickStats } from './components/shared';
import { ActionCard } from './components/ActionCard';
import { ApplicationCard, FilterTabs } from './components/ApplicationCard';
import { ProfileCard } from './components/ProfileCard';
import { ProfileFormModal } from './components/ProfileFormModal';
import { PreviewModal } from './components/PreviewModal';
import { SettingsSection } from './components/SettingsSection';
import { AnalyticsSection } from './components/AnalyticsSection';
import { BulkSection } from './components/BulkSection';

import { FillReportCard } from './components/FillReportCard';
import { GenerateDocumentsCard } from './components/GenerateDocumentsCard';
import { ImportPreviewModal } from './components/ImportPreviewModal';
import { VirtualList } from './components/VirtualList';
import { HomeInsightsSection } from './components/HomeInsightsSection';
import { ReviewJobsSection } from './components/ReviewJobsSection';
import { ChatSection } from './components/ChatSection';

// Constants
import { NON_SCRIPTABLE_PROTOCOLS, UNSUPPORTED_HOSTNAMES } from './constants';
import { apiFetchJson } from './utils/api-config';
import type { MissingApplicationField } from '../types/answer-memory';
import { getApplicationPreviewDocs } from './utils/document-previews';
import { documentJobKey } from './utils/job-tabs';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getUnsupportedTabMessage(url?: string): string | null {
  if (!url) return 'Open a job application page before running Autofill.';

  try {
    const parsed = new URL(url);
    if ((NON_SCRIPTABLE_PROTOCOLS as readonly string[]).includes(parsed.protocol)) {
      return `Autofill cannot run on ${parsed.protocol} pages. Open a normal job application tab first.`;
    }
    if ((UNSUPPORTED_HOSTNAMES as readonly string[]).includes(parsed.hostname)) {
      return 'Autofill cannot run on Chrome Web Store pages.';
    }
  } catch {
    return 'Open a valid job application page before running Autofill.';
  }
  return null;
}

/**
 * Build a fill plan entirely client-side — same logic as the server's /profile/map-fields
 * but with zero network latency. Covers 95%+ of standard fields without any AI call.
 */
function buildFillPlanLocally(
  fields: Array<{ key: string; type: string; label: string }>,
  profile: Profile
): Record<string, string> {
  const profileData: Record<string, string> = {
    firstname: profile.name?.split(' ')[0] || '',
    lastname: profile.name?.split(' ').slice(1).join(' ') || '',
    fullname: profile.name || '',
    email: profile.email || '',
    phone: profile.phone || '',
    location: profile.location || '',
    linkedin: profile.linkedin_url || '',
    github: profile.github_url || '',
    portfolio: profile.portfolio_url || '',
  };

  const labelPatterns: Array<[RegExp, string]> = [
    [/first[\s_-]?name|given[\s_-]?name|\bfname\b/i, 'firstname'],
    [/last[\s_-]?name|surname|family[\s_-]?name|\blname\b/i, 'lastname'],
    [/full[\s_-]?name|your[\s_-]?name/i, 'fullname'],
    [/e[\s-]?mail/i, 'email'],
    [/phone|tel|mobile|cell/i, 'phone'],
    [/linkedin/i, 'linkedin'],
    [/github/i, 'github'],
    [/portfolio|personal[\s-]?site/i, 'portfolio'],
    [/city|location/i, 'location'],
  ];

  const plan: Record<string, string> = {};
  for (const field of fields) {
    const fieldKey = field.key || field.label;
    const normalized = fieldKey.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Direct key match
    for (const [profileKey, profileValue] of Object.entries(profileData)) {
      if (
        normalized === profileKey ||
        normalized.includes(profileKey) ||
        profileKey.includes(normalized)
      ) {
        if (profileValue) {
          plan[fieldKey] = profileValue;
          break;
        }
      }
    }
    if (plan[fieldKey]) continue;

    // 2. Label pattern match
    for (const [pattern, profileKey] of labelPatterns) {
      if (pattern.test(field.label) || pattern.test(fieldKey)) {
        if (profileData[profileKey]) {
          plan[fieldKey] = profileData[profileKey];
          break;
        }
      }
    }
  }
  return plan;
}

/** Build a profile data map for the content script */
function buildProfilePayload(profile: Profile) {
  return {
    firstName: profile.name?.split(' ')[0] || '',
    lastName: profile.name?.split(' ').slice(1).join(' ') || '',
    fullName: profile.name || '',
    email: profile.email || '',
    phone: profile.phone || '',
    location: profile.location || '',
    linkedin: profile.linkedin_url || '',
    github: profile.github_url || '',
    portfolio: profile.portfolio_url || '',
    address: profile.location || '',
    city: '',
    postcode: '',
    country: '',
    state: '',
    headline: profile.name || '',
  };
}

/** Map of profile key → value for fill report display */
function buildProfileKeyToValue(profile: Profile): Record<string, string> {
  return {
    firstName: profile.name?.split(' ')[0] || '',
    lastName: profile.name?.split(' ').slice(1).join(' ') || '',
    fullName: profile.name || '',
    email: profile.email || '',
    phone: profile.phone || '',
    linkedin: profile.linkedin_url || '',
    github: profile.github_url || '',
    portfolio: profile.portfolio_url || '',
    location: profile.location || '',
    resume_upload: '',
  };
}

// ── AppContent ───────────────────────────────────────────────────────────────

const AppContent = () => {
  const toast = useToast();
  const confirm = useConfirm();

  // UI state via Zustand
  const {
    activeTab,
    setActiveTab,
    recentFilter,
    setRecentFilter,
    showProfileForm,
    setShowProfileForm,
    bulkUrls,
    setBulkUrls,
    previewApp,
    setPreviewApp,
    previewDoc,
    setPreviewDoc,
    previewDocs,
    setPreviewDocs,
    fillReport,
    setFillReport,
    updateFillReportField,
    importPreviewData,
    setImportPreviewData,
    isApplying,
    setIsApplying,
    chatMessages,
    addChatMessage,
    clearChatMessages,
    isChatLoading,
    setIsChatLoading,
  } = useAppStore();

  // React Query data fetching
  const { connected, profile, config, applications, queueStats, isLoading, isError } =
    useExtensionData();

  // Tab URL polling via React Query
  const { data: currentTabUrl } = useCurrentTabUrl();

  // Derived state
  const timeSaved = useMemo(
    () => applications.reduce((acc, app) => acc + (app.time_saved || 0), 0),
    [applications]
  );

  // Mutations
  const saveProfileMutation = useSaveProfile();
  const importProfileMutation = useImportProfile();
  const deleteApplicationMutation = useDeleteApplication();
  const updateConfigMutation = useUpdateConfig();
  const generateDocsMutation = useGenerateDocuments();
  const bulkAddMutation = useBulkAdd();
  const bulkProcessMutation = useBulkProcess();
  const mapFieldsMutation = useMapFields();
  const downloadDocumentMutation = useDownloadDocument();
  const chatMutation = useSendChatMessage();

  // Loading states
  const isSavingProfile = saveProfileMutation.isPending || importProfileMutation.isPending;
  const isGeneratingDocs = generateDocsMutation.isPending;
  const isBulkProcessing = bulkProcessMutation.isPending;

  // ── Chat handler ────────────────────────────────────────────────────

  const handleSendChat = useCallback(
    async (content: string) => {
      const userMsg = {
        id: `user-${Date.now()}`,
        role: 'user' as const,
        content,
        timestamp: Date.now(),
      };
      addChatMessage(userMsg);
      setIsChatLoading(true);

      try {
        const allMessages = [
          ...chatMessages.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content },
        ];
        const reply = await chatMutation.mutateAsync({
          messages: allMessages,
          url: currentTabUrl,
        });
        addChatMessage({
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: reply,
          timestamp: Date.now(),
        });
      } catch (err) {
        addChatMessage({
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, I encountered an error: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
          timestamp: Date.now(),
        });
      } finally {
        setIsChatLoading(false);
      }
    },
    [chatMessages, addChatMessage, setIsChatLoading, chatMutation, currentTabUrl]
  );

  // ── Event handlers ──────────────────────────────────────────────────

  const handleGenerateDocuments = async (type: 'resume' | 'cover-letter' | 'both', description?: string) => {
    if (!currentTabUrl) {
      toast.error('No active job URL detected');
      return;
    }

    if (!connected) {
      toast.error('API server not connected. Make sure to run "bun run api".');
      return;
    }

    try {
      const result = await generateDocsMutation.mutateAsync({
        url: currentTabUrl,
        type,
        pageSource: description ? { url: currentTabUrl, title: 'User supplied job description', text: description } : undefined,
      });
      toast.success('Documents generated successfully');
      return result;
    } catch (err) {
      toast.error(
        (err instanceof Error ? err.message : String(err)) || 'Failed to generate documents'
      );
    }
  };

  const updateAppConfig = async (
    newConfig: Parameters<typeof updateConfigMutation.mutateAsync>[0]
  ) => {
    try {
      await updateConfigMutation.mutateAsync(newConfig);
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
  };

  const saveProfile = async (formData: Partial<Profile>) => {
    try {
      await saveProfileMutation.mutateAsync({
        formData,
        profileId: profile?.id,
      });
      setShowProfileForm(false);
      setImportPreviewData(null);
      toast.success('Profile saved successfully');
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Failed to save profile');
    }
  };

  const deleteApplication = async (id: number) => {
    try {
      await deleteApplicationMutation.mutateAsync(id);
      toast.success('Application deleted');
    } catch {
      toast.error('Failed to delete application');
    }
  };

  const importProfileFromResume = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.pdf';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = await importProfileMutation.mutateAsync(text);
        setImportPreviewData(data);
        setShowProfileForm(false);
        toast.info('Review the extracted data before saving');
      } catch (err) {
        toast.error(
          (err instanceof Error ? err.message : String(err)) || 'Failed to import profile'
        );
      }
    };
    input.click();
  };

  const handleBulkAdd = async () => {
    const urls = bulkUrls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      toast.warning('Please enter at least one URL');
      return;
    }

    try {
      const result = await bulkAddMutation.mutateAsync({ urls });
      setBulkUrls('');
      toast.success(`${result.added} URL${result.added !== 1 ? 's' : ''} added to queue`);
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Failed to add URLs');
    }
  };

  const handleBulkProcess = async () => {
    const autoSubmit = config?.application?.autoSubmit;
    const pendingCount = queueStats?.pending ?? 0;

    // Require explicit confirmation before a bulk auto-submit run.
    // Fill-only mode (autoSubmit off) is non-destructive — no gate needed.
    if (autoSubmit) {
      const ok = await confirm({
        title: 'Submit applications automatically?',
        message: `Auto-submit is ON. Processing will submit ${pendingCount} job${pendingCount !== 1 ? 's' : ''} without per-job review. Make sure your profile and documents are up to date before continuing.`,
        confirmLabel: 'Yes, process queue',
        cancelLabel: 'Cancel',
      });
      if (!ok) return;
    }

    try {
      await bulkProcessMutation.mutateAsync({
        autoSubmit,
        delaySeconds: config?.application?.rateLimitDelay || 0,
      });
      toast.success('Queue processing started');
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Bulk processing failed');
    }
  };

  // ── Autofill logic ──────────────────────────────────────────────────

  const sendMessageToTab = async (
    tabId: number,
    message: Record<string, unknown>,
    tabUrl?: string
  ) => {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      const error = err as Record<string, unknown>;
      if (
        typeof error.message === 'string' &&
        error.message.includes('Could not establish connection')
      ) {
        const unsupportedTabMessage = getUnsupportedTabMessage(tabUrl);
        if (unsupportedTabMessage) {
          throw new Error(unsupportedTabMessage);
        }

        try {
          // Inject once per frame, including the main frame.
          await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: ['content.js'],
          });

          await chrome.tabs.sendMessage(tabId, { type: 'PING' });
          return await chrome.tabs.sendMessage(tabId, message);
        } catch (injectionError) {
          const error = injectionError as Record<string, unknown>;
          const msg = typeof error.message === 'string' ? error.message : 'Unknown injection error';
          throw new Error(`Could not attach to the page. Reload and try again. (${msg})`);
        }
      }
      throw err;
    }
  };

  const handleAutofill = async () => {
    if (isApplying || isGeneratingDocs) return;
    setIsApplying(true);

    if (!connected) {
      toast.error('API server not connected');
      setIsApplying(false);
      return;
    }

    if (!profile) {
      toast.error('No profile found. Please set up your profile first.');
      setIsApplying(false);
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url) throw new Error('No active job tab found');

      const unsupportedTabMessage = getUnsupportedTabMessage(tab.url);
      if (unsupportedTabMessage) {
        throw new Error(unsupportedTabMessage);
      }

      // Kick off resume download in parallel with form field detection
      const latestDocs = generateDocsMutation.data;
      let generatedDocs =
        latestDocs && tab.url && documentJobKey(latestDocs.jobUrl) === documentJobKey(tab.url)
          ? latestDocs
          : null;
      if (latestDocs?.resume && !generatedDocs)
        toast.warning(
          'The generated resume belongs to a different job. Generate a resume for this job before attaching it.'
        );
      if (!generatedDocs?.resume) {
        toast.warning('Reading this job description and generating its resume before filling…');
        generatedDocs = await generateDocsMutation.mutateAsync({ url: tab.url, type: 'resume' });
      }
      const current = await chrome.tabs.get(tab.id);
      if (!current.url || documentJobKey(current.url) !== documentJobKey(tab.url)) {
        throw new Error('The job changed during generation. Select the correct job tab before filling.');
      }
      const resumePromise: Promise<{ base64: string; filename: string } | null> =
        generatedDocs?.resume
          ? downloadDocumentMutation
              .mutateAsync(generatedDocs.resume)
              .then(
                (blob) =>
                  new Promise<{ base64: string; filename: string }>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () =>
                      resolve({
                        base64: reader.result as string,
                        filename: generatedDocs.resume ?? '',
                      });
                    reader.readAsDataURL(blob);
                  })
              )
              .catch(() => null)
          : Promise.resolve(null);

      // Detect form fields (runs in parallel with resume download above)
      let fillPlan: Record<string, string> = {};
      let savedKeys: string[] = [];
      let formFields: import('../ai/application-answers').DetectedApplicationField[] = [];
      try {
        const detectedFields = await sendMessageToTab(tab.id, { type: 'GET_FORM_FIELDS' }, tab.url);
        if (detectedFields?.fields?.length > 0) {
          formFields = detectedFields.fields;
          // Build fillPlan locally — no server round-trip needed for standard fields
          fillPlan = buildFillPlanLocally(detectedFields.fields, profile);

          // Saved responses take precedence over automatic mapping for unanswered fields.
          if (formFields.length > 0) {
            try {
              const result = await mapFieldsMutation.mutateAsync({
                fields: formFields,
                url: tab.url,
              });
              Object.assign(fillPlan, result.fillPlan || {});
              savedKeys = result.savedKeys || [];
            } catch {
              // server mapping is best-effort
            }
          }
        }
      } catch {
        // fillPlan is optional
      }

      // Await resume (was already fetching in parallel)
      let resumeBase64: string | undefined;
      let resumeFilename: string | undefined;
      try {
        const resumeResult = await resumePromise;
        if (resumeResult) {
          resumeBase64 = resumeResult.base64;
          resumeFilename = resumeResult.filename;
        }
      } catch {
        throw new Error('Could not download the generated resume. Retry before filling this application.');
      }
      const fillTab = await chrome.tabs.get(tab.id);
      if (fillTab.url !== tab.url) throw new Error('The job tab changed. Try again on the correct application.');

      // Send profile to content script
      const profilePayload = {
        type: 'AUTOFILL_WITH_PROFILE',
        expectedUrl: tab.url,
        savedKeys,
        fillPlan,
        documents: resumeBase64 ? { resume: resumeBase64, resumeFilename } : undefined,
        profile: buildProfilePayload(profile),
      };

      // Send to main frame first
      const fillResult = await sendMessageToTab(tab.id, profilePayload, tab.url);
      if (fillResult?.errors?.length) toast.warning(fillResult.errors.join(' '));
      let filledArr: string[] = fillResult?.filled || [];

      // For Ashby and other iframe-based platforms, also try all frames
      try {
        const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
        for (const frame of frames || []) {
          if (frame.frameId !== 0) {
            try {
              const frameRes = await chrome.tabs.sendMessage(tab.id, { ...profilePayload, expectedUrl: frame.url }, {
                frameId: frame.frameId,
              });
              if (frameRes?.filled?.length) {
                filledArr = Array.from(new Set([...filledArr, ...frameRes.filled]));
              }
            } catch {
              // Not all frames accept messages
            }
          }
        }
      } catch {
        // webNavigation may not be available
      }

      const after = await sendMessageToTab(tab.id, { type: 'GET_FORM_FIELDS' }, tab.url);
      const missing: MissingApplicationField[] = (after?.fields || []).filter(
        (field: MissingApplicationField) => field.label && !field.currentValue?.trim()
      );
      const profileKeyToValue = buildProfileKeyToValue(profile);
      setFillReport({
        filled: filledArr.map((key) => ({
          key,
          label: formFields.find((field) => field.key === key)?.label,
          value: fillPlan[key] ?? profileKeyToValue[key] ?? '',
        })),
        enteredAnswers: (after?.fields || []).filter(
          (field: MissingApplicationField) =>
            field.rememberable &&
            field.currentValue?.trim() &&
            !/^(?:name|full name|first name|last name|email|phone|location|linkedin|github|portfolio)\s*\*?$/i.test(
              field.label
            )
        ),
        skipped: missing.length,
        missing,
        tabId: tab.id,
        url: tab.url,
      });
      if (missing.length)
        toast.warning(
          `${missing.length} unanswered fields need your review. Save answers in the Fill Report to reuse them.`
        );
      if (filledArr.length > 0 || fillResult?.success) {
        toast.success(
          `${filledArr.length} field${filledArr.length !== 1 ? 's' : ''} filled successfully`
        );
      } else if (fillResult?.error) {
        throw new Error(fillResult.error);
      }
    } catch (err) {
      console.error('Autofill failed', err);
      toast.error((err instanceof Error ? err.message : String(err)) || 'Autofill failed');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRefillField = async (fieldKey: string, value: string): Promise<boolean> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return false;
      const result = await sendMessageToTab(
        tab.id,
        { type: 'REFILL_FIELD', fieldKey, value },
        tab.url
      );
      if (result?.success) {
        updateFillReportField(fieldKey, value);
      }
      return result?.success === true;
    } catch {
      return false;
    }
  };

  const handleSaveAnswer = async (
    field: MissingApplicationField,
    answer: string,
    scope: 'all' | 'job'
  ) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!fillReport?.url || tab.id !== fillReport.tabId || tab.url !== fillReport.url)
      throw new Error('Return to the application that produced this report before saving.');
    await apiFetchJson('/profile/answers', {
      method: 'POST',
      body: JSON.stringify({ field, answer, scope, url: fillReport.url }),
    });
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id !== tab.id || active.url !== fillReport.url)
      throw new Error('Answer saved. Return to the original application to fill it.');
    const result = await sendMessageToTab(
      tab.id as number,
      {
        type: 'REFILL_FIELD',
        fieldKey: field.key,
        fieldLabel: field.label,
        expectedUrl: fillReport.url,
        value: answer,
        remembered: true,
      },
      tab.url
    );
    const after = await sendMessageToTab(tab.id as number, { type: 'GET_FORM_FIELDS' }, tab.url);
    const actual = after.fields?.find(
      (item: MissingApplicationField) => item.key === field.key
    )?.currentValue;
    if (!result?.success || !actual?.trim())
      throw new Error(
        'Answer saved, but this control could not be filled. Complete it on the application page.'
      );
    const latest = useAppStore.getState().fillReport;
    if (latest?.url === fillReport.url)
      setFillReport({
        ...latest,
        filled: [
          ...latest.filled.filter((item) => item.key !== field.key),
          { key: field.key, label: field.label, value: answer },
        ],
        missing: latest.missing?.filter((item) => item.key !== field.key),
        enteredAnswers: latest.enteredAnswers?.filter((item) => item.key !== field.key),
        skipped: Math.max(0, latest.missing?.filter((item) => item.key !== field.key).length ?? 0),
      });
    toast.success('Answer saved and filled');
  };

  // ── Loading state ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="h-screen bg-(--bg-primary)">
        <LoadingState />
      </div>
    );
  }

  // ── Filters ─────────────────────────────────────────────────────────

  const filteredApps =
    recentFilter === 'all'
      ? applications
      : applications.filter((app) => app.status === recentFilter);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-(--bg-primary)">
      <ConnectionBanner connected={connected} />

      <Header connected={connected} />

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24 space-y-4">
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            <JobSearchSection />
            <ActionCard
              onApply={handleAutofill}
              isApplying={isApplying || isGeneratingDocs}
              connected={connected}
              error={isError ? 'Failed to load extension data' : null}
              onRetry={() => window.location.reload()}
              onDismissError={() => {}}
            />

            {fillReport && (
              <FillReportCard
                report={fillReport}
                onDismiss={() => setFillReport(null)}
                onRefill={handleRefillField}
                onSaveAnswer={handleSaveAnswer}
              />
            )}

            <GenerateDocumentsCard
              currentUrl={currentTabUrl}
              onGenerate={handleGenerateDocuments}
              isGenerating={isGeneratingDocs || isApplying}
              generatedDocs={generateDocsMutation.data && currentTabUrl && documentJobKey(generateDocsMutation.data.jobUrl) === documentJobKey(currentTabUrl) ? generateDocsMutation.data : null}
              connected={connected}
              onPreview={(type) => {
                const data = generateDocsMutation.data;
                if (!data) return;

                if (type === 'both') {
                  const docs: import('./components/PreviewModal').DocPreview[] = [];
                  if (data.resumeContent) {
                    docs.push({
                      title: `Resume — ${currentTabUrl ? new URL(currentTabUrl).hostname.replace('www.', '') : ''}`,
                      content: data.resumeContent,
                      originalContent: data.sourceResume,
                      filename: data.resume,
                      type: 'resume',
                    });
                  }
                  if (data.coverLetterContent) {
                    docs.push({
                      title: `Cover Letter — ${currentTabUrl ? new URL(currentTabUrl).hostname.replace('www.', '') : ''}`,
                      content: data.coverLetterContent,
                      filename: data.coverLetter,
                      type: 'cover-letter',
                    });
                  }
                  if (docs.length > 0) setPreviewDocs(docs);
                  return;
                }

                if (type === 'resume' && data.resumeContent) {
                  setPreviewDoc({
                    title: `Resume — ${currentTabUrl ? new URL(currentTabUrl).hostname.replace('www.', '') : ''}`,
                    content: data.resumeContent,
                    originalContent: data.sourceResume,
                    filename: data.resume,
                    type: 'resume',
                  });
                } else if (type === 'cover-letter' && data.coverLetterContent) {
                  setPreviewDoc({
                    title: `Cover Letter — ${currentTabUrl ? new URL(currentTabUrl).hostname.replace('www.', '') : ''}`,
                    content: data.coverLetterContent,
                    filename: data.coverLetter,
                    type: 'cover-letter',
                  });
                }
              }}
            />

            <QuickStats timeSaved={timeSaved} applicationsCount={applications.length} />

            <ReviewJobsSection applications={applications} onPreview={setPreviewApp} />

            <HomeInsightsSection
              currentTabUrl={currentTabUrl}
              applications={applications}
              profile={profile}
              onNavigateTab={setActiveTab}
            />
          </div>
        )}

        {activeTab === 'chat' && (
          <ChatSection
            messages={chatMessages}
            onSend={handleSendChat}
            onClear={clearChatMessages}
            isLoading={isChatLoading}
            connected={connected}
            hasProfile={!!profile}
          />
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-4">
            <AnalyticsSection applications={applications} />

            {/* Application History */}
            <div className="pt-2">
              <h3 className="text-sm font-semibold text-(--text-primary) mb-3">
                Application History
              </h3>
              <FilterTabs active={recentFilter} onChange={setRecentFilter} />

              <div className="mt-3">
                {filteredApps.length > 0 ? (
                  <VirtualList
                    items={filteredApps}
                    itemHeight={80}
                    maxHeight={400}
                    className="space-y-2"
                    renderItem={(app, i) => (
                      <div
                        key={app.id ?? `${app.url}-${app.created_at}`}
                        className="animate-fade-in"
                        style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                      >
                        <ApplicationCard
                          application={app}
                          onDelete={() => app.id && deleteApplication(app.id)}
                          onPreview={() => setPreviewApp(app)}
                        />
                      </div>
                    )}
                  />
                ) : (
                  <div className="card">
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <History className="w-6 h-6" />
                      </div>
                      <h3 className="empty-state-title">No applications found</h3>
                      <p className="empty-state-description">
                        {recentFilter === 'all'
                          ? 'Use autofill on a job page to start tracking'
                          : `No applications found with status "${recentFilter}"`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-4">
            <ProfileCard profile={profile} onEdit={() => setShowProfileForm(true)} />

            <BulkSection
              urls={bulkUrls}
              onUrlsChange={setBulkUrls}
              onAdd={handleBulkAdd}
              onProcess={handleBulkProcess}
              stats={queueStats}
              isProcessing={isBulkProcessing}
            />
          </div>
        )}

        {activeTab === 'settings' && <SettingsSection config={config} onUpdate={updateAppConfig} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-(--bg-secondary)/95 backdrop-blur-xl border-t border-(--border-subtle) safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            aria-label="Dashboard"
            aria-current={activeTab === 'dashboard' ? 'page' : undefined}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Home</span>
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
            aria-label="Chat"
            aria-current={activeTab === 'chat' ? 'page' : undefined}
          >
            <MessageSquare className="w-5 h-5" />
            <span>Chat</span>
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            aria-label="Stats"
            aria-current={activeTab === 'analytics' ? 'page' : undefined}
          >
            <BarChart3 className="w-5 h-5" />
            <span>Stats</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
            aria-label="Profile"
            aria-current={activeTab === 'profile' ? 'page' : undefined}
          >
            <User className="w-5 h-5" />
            <span>Profile</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            aria-label="Settings"
            aria-current={activeTab === 'settings' ? 'page' : undefined}
          >
            <SettingsIcon className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </div>
      </nav>

      {/* Preview modals */}
      {previewApp && (previewApp.generated_resume || previewApp.generated_cover_letter) && (
        <PreviewModal
          docs={getApplicationPreviewDocs(previewApp, profile)}
          onClose={() => setPreviewApp(null)}
        />
      )}
      {previewDocs && previewDocs.length > 0 && (
        <PreviewModal docs={previewDocs} onClose={() => setPreviewDocs(null)} />
      )}
      {previewDoc && !previewDocs && (
        <PreviewModal docs={[previewDoc]} onClose={() => setPreviewDoc(null)} />
      )}

      {showProfileForm && (
        <ProfileFormModal
          profile={profile}
          onSave={saveProfile}
          onCancel={() => setShowProfileForm(false)}
          onImport={importProfileFromResume}
          isSaving={isSavingProfile}
        />
      )}

      {importPreviewData && (
        <ImportPreviewModal
          data={importPreviewData}
          onSave={saveProfile}
          onCancel={() => setImportPreviewData(null)}
          isSaving={isSavingProfile}
        />
      )}
    </div>
  );
};

// ── App root ─────────────────────────────────────────────────────────────────

const App = () => (
  <Providers>
    <ToastProvider>
      <ConfirmProvider>
        <AppContent />
      </ConfirmProvider>
    </ToastProvider>
  </Providers>
);

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
