import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Nav from '../components/Nav'

export default function App({ Component, pageProps }: AppProps) {
  let obj: Record<any, any> = {
    "Home": '/', 
  }
  if(pageProps.rootUser) {
    obj["Settings"] = "/settings"
  }
  return <><Nav 
  name="Hpsk's CDN"
  mainRoutes={obj}
  active={""}
/><Component {...pageProps} /></>
}
