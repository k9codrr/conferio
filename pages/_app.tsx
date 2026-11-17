import { SessionProvider } from 'next-auth/react';
import { appWithTranslation } from 'next-i18next';
import Head from 'next/head'
import { Toaster } from 'react-hot-toast';
import { Toaster as SonnerToaster } from 'sonner';
import type { AppPropsWithLayout } from 'types/index';
import mixpanel from 'mixpanel-browser';
import '../pages/globals.css';
import { useEffect } from 'react';
import env from '@/lib/env';
import { AccountLayout } from '@/components/layouts';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import QueryProvider from 'contexts/query-provider';
import { NuqsAdapter } from 'nuqs/adapters/next/pages';
import { NextContext } from 'hooks/use-context';
import { SocketProvider } from '@/components/chat-components/providers/socket-provider';
import { useRouter } from "next/router";
import { useIsMobile } from "hooks/useIsMobile";
import { CallProvider } from 'contexts/CallContext';
import { NotificationProvider } from "../components/notifications/NotificationContext";
import { NotificationToastContainer } from "../components/notifications/NotificationToast";
import ReminderAlarm from "../components/notifications/ReminderAlarm";
import ThemeStyle from "../components/theme/ThemeStyle";
import GlobalCallOverlay from '@/components/calls/GlobalCallOverlay';
import { ScreenShareProvider } from 'contexts/ScreenShareContext';
import { ScreenShareConsentModal } from '@/components/screenshare/ConsentModal';
// import { useBroadcastLocation } from 'hooks/useUserLocation';
import 'ldrs/react/LineSpinner.css'
import 'styles/whiteboard.css'
import ConferioAI from '@/components/ai/ConferioAI';
import { RecordingProvider } from 'contexts/RecordingContext';
import { UploadPopup } from '@/components/clips/UploadPopup';
import { useScreenTime } from 'hooks/useScreenTime';
// import { IntroDisclosureDemo } from '@/components/ui/IntroDisclosureDemo';
import { useSyncTeamFromUrl } from 'hooks/useSyncTeamFromUrl';


// Records page views for admin Live activity / module stats (needs the session context).
function ScreenTimeTracker() {
  useScreenTime();
  return null;
}

function TeamSyncWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const urlSlug = router.query.slug as string | undefined;

  useSyncTeamFromUrl(urlSlug);

  return <>{children}</>;
}


function MyApp({ Component, pageProps }: AppPropsWithLayout) {
  const { session, ...props } = pageProps;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isMusicRoute = router.pathname.startsWith("/music");

  // Add mixpanel
  useEffect(() => {
    if (env.mixpanel.token) {
      mixpanel.init(env.mixpanel.token, {
        debug: true,
        ignore_dnt: true,
        track_pageview: true,
      });
    }
  }, []);

  // useScreenTime();


  // useEffect(() => {
  //   if (isMobile && window.location.pathname !== "/mobile-development") {
  //     router.replace("/mobile-development");
  //   }
  // }, [isMobile, router]);

  const getLayout =
    Component.getLayout || ((page) => <AccountLayout>{page}</AccountLayout>);

  return (
    <>
      <SessionProvider session={session}
        refetchOnWindowFocus={false}
        refetchInterval={0}>
        <QueryProvider>
          <NuqsAdapter>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
              disableTransitionOnChange>
              <NotificationProvider>
                <ScreenShareProvider>
                  <SocketProvider>
                    <CallProvider>
                      <RecordingProvider>
                        <TeamSyncWrapper>
                          <NotificationToastContainer />
                          <ReminderAlarm />
                          <ScreenTimeTracker />
                          <ThemeStyle />
                          <GlobalCallOverlay />
                          {getLayout(<Component {...pageProps} />)}
                          <ScreenShareConsentModal />
                          <Toaster toastOptions={{ duration: 3000 }} />
                          <SonnerToaster richColors closeButton position="bottom-left" />
                          <UploadPopup />
                          {/* <ConferioAI/> */}
                          {/* <IntroDisclosureDemo/> */}
                        </TeamSyncWrapper>
                      </RecordingProvider>
                    </CallProvider>
                  </SocketProvider>
                </ScreenShareProvider>
              </NotificationProvider>
            </ThemeProvider>
          </NuqsAdapter>
        </QueryProvider>
      </SessionProvider>
    </>
  );
}



export default appWithTranslation<never>(MyApp);
