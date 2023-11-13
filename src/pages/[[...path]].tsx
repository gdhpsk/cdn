import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button, Container, Form, InputGroup, Table } from 'react-bootstrap'
import jwt from "jsonwebtoken"

export default function Home({ items, path, rootUser }: any) {
  let [files, changeFiles] = useState(items)
  let [viewFile, selectViewFile] = useState("")
  let [message, setMessage] = useState("")
  let [deleting, setDeleting] = useState<any[]>([])
  let [loadingState, setLoadingState] = useState(false)
  useEffect(() => {
    if (message) {
      setTimeout(() => {
        setMessage("")
      }, 3000)
    }
  }, [message])
  return (
    <Container>
      <h1 style={{ textAlign: "center", marginTop: "100px" }}>{path.split("/").slice(path == "/" ? 1 : 0).map((e: any, i: any, a: any) => { return {url: a.slice(0, i+1).join("/").slice(1) || "/", name: e || "/"}}).map((e:any) => <>{e.name !== "/" ? " => " : ""}<span style={{textDecoration: "underline"}} key={e.name} onClick={() => window.location.href = `http://localhost:3000/${e.url}`}>{decodeURIComponent(e.name)}</span></>)}</h1>
      <br></br>
      {deleting.length ? <h3 style={{ textAlign: "center" }}>Deleting {deleting.length} objects: <Button style={{ backgroundColor: "red" }} onClick={async () => {
        setLoadingState(true)
        for (const object of deleting) {
          try {
            let res = await fetch(`/api/bucket/${object.dir ? "dir" : 'file'}${object.path}`, {
              method: "DELETE"
            })
            if (res.status != 204) {
              let data = await res.json()
              setLoadingState(false)
              return setMessage(data.message)
            }
            let resp = await fetch("http://localhost:3000/api/bucket/dir"+path)
            let data = await resp.json()
            changeFiles(data)
          } catch (e) {
            setMessage("Looks like an error has occured, please check the console.")
            setLoadingState(false)
            return console.error(e)
          }
        }
        setLoadingState(false)
        setMessage(`Successfully deleted ${deleting.length} objects!`)
        setDeleting([])
      }}>Delete</Button></h3> : rootUser ? <div style={{display: "grid", placeItems: "center"}}><InputGroup style={{width: "min(800px, 100%)"}}>
      <InputGroup.Text id="lu">Upload FIles</InputGroup.Text>
          <Form.Control required aria-describedby='lu' placeholder="API Key..." id="files_to_upload" type="file" multiple></Form.Control>
      </InputGroup>
      <br></br>
                <Button type="button" onClick={async () => {
                  let files: any = document.getElementById("files_to_upload")
                  if(!files.files.length) return  setMessage("Please set some files to upload!")
                  const read = (blob: Blob) => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (event: any) => resolve(event.target.result);
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(blob);
                  });
                  setLoadingState(true)
                  for (const file of files.files) {
                    let fileData = await read(file)
                    try {
                      let formdata = new FormData()
                      formdata.append("file", `[${new Uint8Array(fileData as any)}]`)
                      let res = await fetch(`/api/bucket/file${path}${path == "/" ? "" : "/"}${file.name}`, {
                        method: "POST",
                        body: formdata
                      })
                      if (res.status != 204) {
                        let data = await res.json()
                        setLoadingState(false)
                        return setMessage(data.message)
                      }
                      let resp = await fetch("http://localhost:3000/api/bucket/dir"+path)
                      let data = await resp.json()
                      changeFiles(data)
                    } catch (e) {
                      setMessage("Looks like an error has occured, please check the console.")
                      setLoadingState(false)
                      console.error(e)
                    }
                  }
                  setLoadingState(false)
                  setMessage(`Successfully added ${files.files.length} objects!`)
                  files.value = ""
                }}>Submit</Button>
      </div> : ""}
      <br></br>
      <h5 style={{textAlign: "center"}}>{message}</h5>
      <div style={{ marginTop: "100px", display: "grid", placeItems: "center" }}>
        <Table className="table">
          <thead>
            <tr>
              <th><input disabled={!rootUser} checked={files.length == deleting.length} type="checkbox" onChange={(e) => {
                let value = e.target.checked
                if (value) {
                  setDeleting(files.map((e: any) => {
                    return {
                      dir: e.isDir,
                      path: e.path
                    }
                  }))
                } else {
                  setDeleting([])
                }
              }}></input></th>
              <th>Name</th>
              <th>MIME</th>
              <th>Size</th>
              <th>Created</th>
              <th><svg id="reload" onClick={async () => {
                setLoadingState(true)
                let res = await fetch("http://localhost:3000/api/bucket/dir"+path)
                let data = await res.json()
                changeFiles(data)
                setLoadingState(false)
              }} style={{ width: "20px", height: "20px" }} xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 30 30">
                <path d="M 15 3 C 12.031398 3 9.3028202 4.0834384 7.2070312 5.875 A 1.0001 1.0001 0 1 0 8.5058594 7.3945312 C 10.25407 5.9000929 12.516602 5 15 5 C 20.19656 5 24.450989 8.9379267 24.951172 14 L 22 14 L 26 20 L 30 14 L 26.949219 14 C 26.437925 7.8516588 21.277839 3 15 3 z M 4 10 L 0 16 L 3.0507812 16 C 3.562075 22.148341 8.7221607 27 15 27 C 17.968602 27 20.69718 25.916562 22.792969 24.125 A 1.0001 1.0001 0 1 0 21.494141 22.605469 C 19.74593 24.099907 17.483398 25 15 25 C 9.80344 25 5.5490109 21.062074 5.0488281 16 L 8 16 L 4 10 z"></path>
              </svg></th>
            </tr>
          </thead>
          <tbody style={{ opacity: loadingState ? "50%" : "100%" }}>
            {files.map((e: any) => <tr key={e.path}>
              <td><input disabled={!rootUser} checked={!!deleting.find(x => x.path == e.path)} type="checkbox" onChange={(x) => {
                let value = x.target.checked
                if (value) {
                  setDeleting([...deleting, { dir: e.isDir, path: e.path }])
                } else {
                  setDeleting(deleting.filter(i => i.path !== e.path))
                }
              }}></input></td>
              <td><a href={`http://localhost:3000${e.isDir ? "" : "/api/bucket/file"}${e.path}`}><img height={32} width={32} src={e.type ? `https://github.com/redbooth/free-file-icons/blob/master/32px/${e.mime == "application/octet-stream" ? "_blank" : e.type}.png?raw=true` : "https://img.icons8.com/ios-filled/50/folder-invoices--v2.png"} />{e.type ? "" : " "}{e.name}</a></td>
              <td>{e.mime || "-"}</td>
              <td>{e.isDir ? "-" : e.size}</td>
              <td>{e.modified}</td>
              <td></td>
            </tr>)}
          </tbody>
        </Table>
      </div>
    </Container>
  )
}

export async function getServerSideProps({ req, res }: any) {
  let ping = await fetch("http://localhost:3000/api/bucket/ping", {
    headers: {
      "Cookie": `token=${req.cookies.token}`
    }
  })
  let {user} = await ping.json()
  let files = await fetch(`http://localhost:3000/api/bucket/dir${req.url}`, {
    headers: {
      "Cookie": `token=${req.cookies.token}`
    }
  })
  let data = []
  try {
    if(files.status !== 200) throw new Error()
    data = await files.json()
  } catch(e) {
  }
  return {
    props: {
      items: data,
      path: req.url,
      rootUser: user === "root"
    }
  }
}