import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Nav from '../components/Nav'
import Head from 'next/head'

export default function App({ Component, pageProps }: AppProps) {
  let obj: Record<any, any> = {
    "Home": '/', 
  }
  if(pageProps.rootUser) {
    obj["Settings"] = "/settings"
  }
  return <>
  <Head>
      <meta property="og:title" content={pageProps.items ? "Folder: " + pageProps.filePath.at(-1) || "/" : "Settings page"}/>
    <meta property="og:description" content={pageProps.items ? `${pageProps.items.filter((e:any) => e.isDir).length} folders, ${pageProps.items.filter((e:any) => !e.isDir).length} files` : "Settings page for the hpskloud"}/>
      </Head>
  <Nav 
  name="hpskloud"
  mainRoutes={obj}
  active={""}
/><Component {...pageProps} /></>
}
