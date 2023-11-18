import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button, Container, Form, InputGroup, Table } from 'react-bootstrap'
import {default as mongoose} from "mongoose"

export default function Home({ data, metadata }: any) {
    let [settings, setSettings] = useState(data)
    let [loadingState, setLoadingState] = useState(false)
    let [token, setToken] = useState("")
    let [message, setMessage] = useState("")
  return (
    <Container>
      <h2 style={{ textAlign: "center", marginTop: "100px" }}>Settings page for Hpsk CDN</h2>
      <h3 style={{ textAlign: "center", marginTop: "50px" }}>{message}</h3>
      <Table className="table">
          <thead>
            <tr>
                <th>Name</th>
                <th>Read Access</th>
                <th>Write Access</th>
                <th><Button style={{marginRight: "30px"}} onClick={() => {
                        setSettings([...settings, {username: "", hasAccessTo: [], writeAccessTo: [], _id: new mongoose.Types.ObjectId().toHexString()}])
                    }}>+</Button></th>
                <th><Button style={{marginRight: "30px"}} onClick={async () => {
                        setLoadingState(true)
                        let edit = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/settings`, {
                            method: "PATCH",
                            headers: {
                              "content-type": "application/json"
                            },
                            body: JSON.stringify(settings)
                          })
                          if(!edit.ok) {
                            return setMessage("An error has occured, please try again.")
                          }
                          setMessage("Success!")
                          setLoadingState(false)
                    }}>Save</Button></th>
            </tr>
        </thead>
        <tbody style={{ opacity: loadingState ? "50%" : "100%" }}>
            {settings.map((e:any) => <tr key={e.name}>
                <td><textarea required aria-describedby='lu' placeholder="Name..." defaultValue={e.username} style={{width: "100%"}} onChange={(i) => {
                        let setting = settings.find((i:any) => i._id == e._id)
                        setting.username = i.target.value
                        let arr = structuredClone(settings)
                        arr.splice(settings.findIndex((i:any) => i._id == e._id), 1, setting)
                        setSettings(arr)
                    }}></textarea></td>
                <td>{e.hasAccessTo.map((x:any, index: any) => <><textarea required aria-describedby='lu' placeholder="Name..." defaultValue={x} style={{width: "100%"}} onChange={(i) => {
                        let setting = settings.find((i:any) => i._id == e._id)
                        setting.hasAccessTo[index] = i.target.value
                        let arr = structuredClone(settings)
                        arr.splice(settings.findIndex((i:any) => i._id == e._id), 1, setting)
                        setSettings(arr)
                    }}></textarea><br></br></>)}
                    <div style={{display: "grid", placeItems: "center"}}><div style={{display: "flex"}}><Button style={{marginRight: "30px"}} onClick={() => {
                        let setting = settings.find((i:any) => i._id == e._id)
                        setting.hasAccessTo.push("")
                        let arr = structuredClone(settings)
                        arr.splice(settings.findIndex((i:any) => i._id == e._id), 1, setting)
                        setSettings(arr)
                    }}>+</Button><Button style={{marginRight: "30px"}} onClick={() => {
                        let setting = settings.find((i:any) => i._id == e._id)
                        setting.hasAccessTo.pop()
                        let arr = structuredClone(settings)
                        arr.splice(settings.findIndex((i:any) => i._id == e._id), 1, setting)
                        setSettings(arr)
                    }}>-</Button></div></div>
                </td>
                <td>{e.writeAccessTo.map((x:any, index: any) => <><textarea required aria-describedby='lu' placeholder="Name..." defaultValue={x} style={{width: "100%"}} onChange={(i) => {
                        let setting = settings.find((i:any) => i._id == e._id)
                        setting.writeAccessTo[index] = i.target.value
                        let arr = structuredClone(settings)
                        arr.splice(settings.findIndex((i:any) => i._id == e._id), 1, setting)
                        setSettings(arr)
                    }}></textarea><br></br></>)}
                <div style={{display: "grid", placeItems: "center"}}><div style={{display: "flex"}}><Button style={{marginRight: "30px"}} onClick={() => {
                       let setting = settings.find((i:any) => i._id == e._id)
                       setting.writeAccessTo.push("")
                       let arr = structuredClone(settings)
                       arr.splice(settings.findIndex((i:any) => i._id == e._id), 1, setting)
                       setSettings(arr)
                    }}>+</Button><Button style={{marginRight: "30px"}} onClick={() => {
                      let setting = settings.find((i:any) => i._id == e._id)
                      setting.writeAccessTo.pop()
                      let arr = structuredClone(settings)
                      arr.splice(settings.findIndex((i:any) => i._id == e._id), 1, setting)
                      setSettings(arr)
                    }}>-</Button></div></div>
                </td>
                <td><Button style={{marginRight: "30px"}} onClick={() => {
                        setSettings([...settings.filter((i:any) => i._id !==e._id)])
                    }}>-</Button></td>
                    <td></td>
            </tr>)}
        </tbody>
      </Table>
      <br></br>
      <h3>Get Token for: <textarea required aria-describedby='lu' placeholder="Name..." id="token-name"></textarea></h3>
      <h3>{token}</h3>
      <Button onClick={async () => {
        let token = (document.getElementById("token-name") as any).value
        let lol = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/token?name=`+token)
        let data = await lol.json()
        setToken(data.token)
      }}>Submit</Button>
    </Container>
  )
}

export async function getServerSideProps({ req, res }: any) {
  let ping = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/ping`, {
    headers: {
      "Cookie": `token=${req.cookies.token}`
    }
  })
  let metadata = await ping.json()
  if(metadata.user !== "root") {
    return{
        notFound: true
    }
  }
  let settings = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/settings`, {
    headers: {
      "Cookie": `token=${req.cookies.token}`
    }
  })
  let data = []
  try {
    if(settings.status !== 200) throw new Error()
    data = await settings.json()
  } catch(e) {

  }
  return {
    props: {
      data,
      metadata,
      rootUser: metadata.user === "root"
    }
  }
}