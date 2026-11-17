import { Head, Html, Main, NextScript } from 'next/document';

// Applies the user's saved custom theme before first paint (see components/theme/ThemeStyle).
const themeBootstrap = `try{var c=localStorage.getItem('conferio:theme-css');if(c){var s=document.createElement('style');s.id='conferio-theme';s.textContent=c;document.head.appendChild(s)}}catch(e){}`;

export default function Document() {
  return (
    <Html lang="en" className="h-full" >
      <Head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </Head>
      <body className="h-full">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
