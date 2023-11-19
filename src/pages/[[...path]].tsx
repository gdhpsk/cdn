import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button, Container, Form, InputGroup, Table } from 'react-bootstrap'
import jwt from "jsonwebtoken"
import Swal from 'sweetalert2'
import withReactContent from 'sweetalert2-react-content'

export default function Home({ items, path, filePath, data, editable, previousPaths }: any) {
  let mySwal = withReactContent(Swal)
  let [metadata, changeMetaData] = useState(data)
  let [uploadProg, setUploadProg] = useState<any>(null)
  let [files, changeFiles] = useState(items)
  let [fileCount, setFileCount] = useState({done: 0, remaining: 0, on: ""})
  let [editing, changeEditing] = useState<any[]>([])
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
      <h2 style={{ textAlign: "center", marginTop: "100px" }}>{metadata.used} GB / {metadata.total} GB used ({(metadata.used / metadata.total*100).toFixed(5)}%)</h2>
      <h5 style={{ textAlign: "center", marginTop: "10px" }}>Extra money being used: ${metadata.used > metadata.total ? ((metadata.used - metadata.total)*0.02).toFixed(2) : 0.00}</h5>
      <h1 style={{ textAlign: "center", marginTop: "30px" }}>{filePath.split("/").slice(filePath == "/" ? 1 : 0).map((e: any, i: any, a: any) => { return {url: previousPaths[i], name: e || "/"}}).map((e:any) => <>{e.name !== "/" ? " => " : ""}<span style={{textDecoration: "underline"}} key={e.name} onClick={() => window.location.href = `${process.env.NEXT_PUBLIC_URL}${encodeURI(e.url)}`}>{decodeURIComponent(e.name)}</span></>)}</h1>
      <br></br>
      <h3 style={{ textAlign: "center", marginTop: "20px" }}>{fileCount.remaining ? `${fileCount.done} / ${fileCount.remaining} remaining` : ""}</h3>
      {deleting.length ? <h3 style={{ textAlign: "center" }}>Deleting {deleting.length} objects: <Button style={{ backgroundColor: "red" }} onClick={async () => {
        setLoadingState(true)
        let count = 0;
        for (const object of deleting) {
          try {
            setFileCount({done: count, remaining: deleting.length, on: object.path})
            let res = await fetch(`/api/bucket/${object.dir ? "dir" : 'file'}${encodeURI(object.path)}`, {
              method: "DELETE"
            })
            if (res.status != 204) {
              let json = await res.json()
                    switch(json.type) {
                      case "OverwriteErr":
                        await new Promise((resolve, reject) => {
                          mySwal.fire({
                            background: "#white",
                            color: "#333333",
                            confirmButtonColor: '#08c',
                            html: <>
                                <h3 style={{textAlign: "center"}}>Warning: the following not fully written files will be affected: <br></br><br></br><ul>{json.affectedFiles.map((e:any) => <li key={e}>{e}</li>)}</ul><br></br> Do you want to overwrite?</h3>
                                <div>
                                  <Button style={{float: "left"}} onClick={async () => {
                                    mySwal.clickConfirm()
                                    let res = await fetch(`/api/bucket/${object.dir ? "dir" : 'file'}${encodeURI(object.path)}?overwrite=true`, {
                                      method: "DELETE"
                                    })
                                    if (!res.ok) {
                                      let data = await res.json()
                                      setLoadingState(false)
                                      setMessage(data.message)
                                      reject()
                                    }
                                    resolve("")
                                  }}>Yes</Button>
                                  <Button style={{float: "right", backgroundColor: "red"}} onClick={() => {
                                    mySwal.clickConfirm()
                                    setLoadingState(false)
                                    setMessage(json.message)
                                    reject()
                                  }}>No</Button>
                                </div>
                            </>
                        })
                        })
                        break;
                      default:
                        setLoadingState(false)
                        return setMessage(json.message)
                    }
            }
            let resp = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/dir`+encodeURI(path))
            let data = await resp.json()
            changeFiles(data.files)
            let resp2 = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/ping`)
            let data2 = await resp2.json()
            changeMetaData(data2)
            count++
          } catch (e) {
            setMessage("Looks like an error has occured, please check the console.")
            setLoadingState(false)
            setFileCount({done: 0, remaining: 0, on: ""})
            return console.error(e)
          }
        }
        setLoadingState(false)
        setFileCount({done: 0, remaining: 0, on: ""})
        setMessage(`Successfully deleted ${deleting.length} objects!`)
        setDeleting([])
      }}>Delete</Button></h3> : editable ? <div style={{display: "grid", placeItems: "center"}}><InputGroup style={{width: "min(800px, 100%)"}}>
      <InputGroup.Text id="lu">Upload FIles</InputGroup.Text>
          <Form.Control required aria-describedby='lu' placeholder="Files..." id="files_to_upload" type="file" multiple></Form.Control>
      </InputGroup>
      <br></br>
                <Button type="button" onClick={async () => {
                  let files: any = document.getElementById("files_to_upload")
                  if(!files.files.length) return  setMessage("Please set some files to upload!")
                  const read = (blob: Blob) => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (event: any) => resolve(new Uint8Array(event.target.result as any))
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(blob);
                  });
                  setLoadingState(true)
                  let count = 0;
                  localStorage.removeItem("key")
                  for (const file of files.files) {
                    try {
                      setFileCount({done: count, remaining: files.files.length, on: `${filePath}${filePath == "/" ? "" : "/"}${file.name}`})
                      let fileData: any = await read(file)
                      setUploadProg({done: 0, remaining: Math.ceil(fileData.length / 8000000)})
                      for(let i = 0; i < fileData.length; i += 8000000) {
                        let key = localStorage.getItem("key") || ""
                        let array = Array.from(fileData.slice(i, i+8000000))
                        let res = await fetch(`/api/bucket/file${filePath}${filePath == "/" ? "" : "/"}${encodeURI(file.name)}`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "X-secret-token": key
                          },
                          body: JSON.stringify(array)
                        })
                        if((localStorage.getItem("cmd") || "") == "STOPIT") {
                          localStorage.removeItem("cmd")
                          let res = await fetch(`/api/bucket/file${filePath}${filePath == "/" ? "" : "/"}${encodeURI(file.name)}`, {
                            method: "POST",
                            headers: {
                              "Content-Type": "text/plain",
                              "X-secret-token": localStorage.getItem("key") || ""
                            },
                            body: "CANCEL"
                          })
                          if (!res.ok) {
                            let data = await res.json()
                            return setMessage(data.message)
                          }
                            localStorage.removeItem("key")
                            let resp = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/dir`+encodeURI(path))
                            let data = await resp.json()
                            changeFiles(data.files)
                            let resp2 = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/ping`)
                            let data2 = await resp2.json()
                            changeMetaData(data2)
                            setLoadingState(false)
                            setUploadProg(null)
                            setFileCount({done: 0, remaining: 0, on: ""})
                            setUploadProg(null)
                            return setMessage("Successfully cancelled all future uploads!")
                        }
                        if (!res.ok) {
                          let data = await res.json()
                          switch(data.type) {
                            case "InvalidTokenErr":
                              let overwrite = await new Promise((resolve, reject) => {
                                mySwal.fire({
                                  background: "#white",
                                  titleText: "Enter API Key",
                                  color: "#333333",
                                  confirmButtonColor: '#08c',
                                  html: <>
                                      <h1 style={{textAlign: "center"}}>This file is currently being written by another user. Do you want to overwrite?</h1>
                                      <div>
                                        <Button style={{float: "left"}} onClick={async () => {
                                          mySwal.clickConfirm()
                                          let res = await fetch(`/api/bucket/file${filePath}${filePath == "/" ? "" : "/"}${encodeURI(file.name)}?overwrite=true`, {
                                            method: "POST",
                                            headers: {
                                              "Content-Type": "application/json",
                                              "X-secret-token": key
                                            },
                                            body: JSON.stringify(array)
                                          })
                                          let data = await res.json()
                                          if (!res.ok) {
                                            setLoadingState(false)
                                            setUploadProg(null)
                                            setMessage(data.message)
                                            setUploadProg(null)
                                            reject("DoNothing")
                                          }
                                          resolve(data)
                                        }}>Yes</Button>
                                        <Button style={{float: "right", backgroundColor: "red"}} onClick={() => {
                                          mySwal.clickConfirm()
                                          reject("OverwriteRejected")
                                        }}>No</Button>
                                      </div>
                                  </>
                              })
                              })
                              localStorage.setItem("key", (overwrite as any).key as string)
                              setUploadProg({done: i / 8000000, remaining: Math.ceil(fileData.length / 8000000)})
                              continue;
                            default:
                              setLoadingState(false)
                              setUploadProg(null)
                              return setMessage(data.message)
                          }
                        }
                        if(i == 0) {
                          let json = await res.json()
                          localStorage.setItem("key", json.key)
                        }
                        setUploadProg({done: i / 8000000, remaining: Math.ceil(fileData.length / 8000000)})
                      }
                      let res = await fetch(`/api/bucket/file${filePath}${filePath == "/" ? "" : "/"}${encodeURI(file.name)}`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "text/plain",
                          "X-secret-token": localStorage.getItem("key") || ""
                        },
                        body: "END"
                      })
                      if (!res.ok) {
                        let data = await res.json()
                        setLoadingState(false)
                        setUploadProg(null)
                        setFileCount({done: 0, remaining: 0, on: ""})
                        setUploadProg(null)
                        return setMessage(data.message)
                      }
                        let resp = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/dir`+encodeURI(path))
                        let data = await resp.json()
                        changeFiles(data.files)
                        let resp2 = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/ping`)
                        let data2 = await resp2.json()
                        changeMetaData(data2)
                        setUploadProg(null)
                        localStorage.removeItem("key")
                        count++;
                    } catch (e) {
                      switch(e) {
                        case "DoNothing":
                          break;
                        case "OverwriteRejected":
                          setUploadProg(null)
                          setLoadingState(false)
                          setFileCount({done: 0, remaining: 0, on: ""})
                          return setMessage("File overwrite has been rejected.")
                        default:
                      setMessage("Looks like an error has occured, please check the console.")
                      setUploadProg(null)
                      setLoadingState(false)
                      setFileCount({done: 0, remaining: 0, on: ""})
                      return console.error(e)   
                      }
                    }
                  }
                  setLoadingState(false)
                  setFileCount({done: 0, remaining: 0, on: ""})
                  setMessage(`Successfully added ${files.files.length} objects!`)
                  files.value = ""
                }}>Submit</Button>
                <br></br>
                <InputGroup style={{width: "min(800px, 100%)"}}>
      <InputGroup.Text id="lu">Create Folder</InputGroup.Text>
          <Form.Control required aria-describedby='lu' placeholder="Folder name..." id="folder_name" type="text" multiple></Form.Control>
      </InputGroup>
      <br></br>
                <Button type="button" onClick={async () => {
                  let folder: any = document.getElementById("folder_name")
                  if(!folder.value) return  setMessage("Please set a folder name to create!")
                  setLoadingState(true)
                  let res = await fetch(`/api/bucket/dir${filePath}${filePath == "/" ? "" : "/"}${encodeURI(folder.value)}`, {
                    method: "POST"
                  })
                  if(res.status !== 204) {
                    let json = await res.json()
                    setLoadingState(false)
                    return setMessage(json.message)
                  }
                  let resp = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/dir`+encodeURI(path))
                  let data = await resp.json()
                  changeFiles(data.files)
                  setLoadingState(false)
                  setMessage(`Successfully added the folder "${folder.value}"!`)
                  folder.value = ""
                }}>Submit</Button>
      </div> : ""}
      <br></br>
      <h5 style={{textAlign: "center"}}>{uploadProg ? `${uploadProg.done} / ${uploadProg.remaining} chunks` : ""}</h5>
      <h6 style={{ textAlign: "center", marginTop: "20px" }}>{fileCount.remaining ? `Currently on path: ${fileCount.on}` : ""}</h6>
      <h5 style={{textAlign: "center"}}>{message}</h5>
      <div style={{display: "grid", placeItems: "center"}}>{uploadProg ? <Button onClick={async (e) => {
        localStorage.setItem("cmd", "STOPIT")
      }}>Cancel</Button> : ""}</div>
      <div style={{ marginTop: "100px", display: "grid", placeItems: "center" }}>
        <Table className="table">
          <thead>
            <tr>
              <th><input disabled={!editable} checked={files.length == deleting.length} type="checkbox" onChange={(e) => {
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
              <th>Modified</th>
              {editable ? <th>Edit</th> : ""}
              <th><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="20px"><path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg></th>
              <th><svg id="reload" onClick={async () => {
                setLoadingState(true)
                let res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/dir`+encodeURI(path))
                let data = await res.json()
                changeFiles(data.files)
                let resp2 = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/ping`)
                let data2 = await resp2.json()
                changeMetaData(data2)
                setLoadingState(false)
              }} style={{ width: "20px", height: "20px" }} xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 30 30">
                <path d="M 15 3 C 12.031398 3 9.3028202 4.0834384 7.2070312 5.875 A 1.0001 1.0001 0 1 0 8.5058594 7.3945312 C 10.25407 5.9000929 12.516602 5 15 5 C 20.19656 5 24.450989 8.9379267 24.951172 14 L 22 14 L 26 20 L 30 14 L 26.949219 14 C 26.437925 7.8516588 21.277839 3 15 3 z M 4 10 L 0 16 L 3.0507812 16 C 3.562075 22.148341 8.7221607 27 15 27 C 17.968602 27 20.69718 25.916562 22.792969 24.125 A 1.0001 1.0001 0 1 0 21.494141 22.605469 C 19.74593 24.099907 17.483398 25 15 25 C 9.80344 25 5.5490109 21.062074 5.0488281 16 L 8 16 L 4 10 z"></path>
              </svg></th>
            </tr>
          </thead>
          <tbody style={{ opacity: loadingState ? "50%" : "100%" }}>
            {files.map((e: any) => <tr key={e.path}>
              <td><input disabled={!editable} checked={!!deleting.find(x => x.path == e.path)} type="checkbox" onChange={(x) => {
                let value = x.target.checked
                if (value) {
                  setDeleting([...deleting, { dir: e.isDir, path: e.path }])
                } else {
                  setDeleting(deleting.filter(i => i.path !== e.path))
                }
              }}></input></td>
              <td>{editing.find(x => x.path == e.path)  ? <textarea defaultValue={e.name} placeholder='name...' onChange={(x) => changeEditing([...editing.filter(i => i.path !== e.path), {path: e.path, value: x.target.value}])}></textarea> : <a href={`${process.env.NEXT_PUBLIC_URL}${e.isDir ? "" : "/api/bucket/file"}${encodeURI(e.url)}`}><img height={32} width={32} src={e.type ? `https://github.com/redbooth/free-file-icons/blob/master/32px/${e.mime == "application/octet-stream" ? "_blank" : e.type}.png?raw=true` : "https://img.icons8.com/ios-filled/50/folder-invoices--v2.png"} />{e.type ? "" : " "}{e.name}</a>}</td>
              <td>{e.mime || "-"}</td>
              <td>{e.isDir ? "-" : e.size}</td>
              <td>{e.modified}</td>
              {editable ? <td><Button onClick={async (x) => {
                if(x.currentTarget.innerText == "Edit") {
                  changeEditing([...editing, {path: e.path, value: e.name}])
                } else {
                  let newName = editing.find(i => i.path == e.path)
                  if(!newName.value) return  setMessage("Please set a valid name to change the object to!!")
                  let {name} = files.find((i:any) => i.path == e.path)
                  setLoadingState(true)
                  let res = await fetch(`/api/bucket/dir${filePath}${filePath == "/" ? "" : "/"}${encodeURI(name)}${e.isDir ? "" : `.${e.type}`}`, {
                    method: "PATCH",
                    headers: {
                      'content-type': "application/json"
                    },
                    body: JSON.stringify({
                      newName: `${newName.value}${e.isDir ? "" : `.${e.type}`}`
                    })
                  })
                  if(res.status !== 204) {
                    let json = await res.json()
                    switch(json.type) {
                      case "OverwriteErr":
                        await new Promise((resolve, reject) => {
                          mySwal.fire({
                            background: "#white",
                            color: "#333333",
                            confirmButtonColor: '#08c',
                            html: <>
                                <h3 style={{textAlign: "center"}}>Warning: the following not fully written files will be affected: <br></br><br></br><ul>{json.affectedFiles.map((e:any) => <li key={e}>{e}</li>)}</ul><br></br> Do you want to overwrite?</h3>
                                <div>
                                  <Button style={{float: "left"}} onClick={async () => {
                                    mySwal.clickConfirm()
                                    let res = await fetch(`/api/bucket/dir${filePath}${filePath == "/" ? "" : "/"}${encodeURI(name)}${e.isDir ? "" : `.${e.type}`}?overwrite=true`, {
                                      method: "PATCH",
                                      headers: {
                                        "Content-Type": "application/json"
                                      },
                                      body:JSON.stringify({
                                        newName: `${newName.value}${e.isDir ? "" : `.${e.type}`}`
                                      })
                                    })
                                    if (!res.ok) {
                                      let data = await res.json()
                                      setLoadingState(false)
                                      setMessage(data.message)
                                      reject()
                                    }
                                    resolve("")
                                  }}>Yes</Button>
                                  <Button style={{float: "right", backgroundColor: "red"}} onClick={() => {
                                    mySwal.clickConfirm()
                                    setLoadingState(false)
                                    setMessage(json.message)
                                    reject()
                                  }}>No</Button>
                                </div>
                            </>
                        })
                        })
                        break;
                      default:
                        setLoadingState(false)
                        return setMessage(json.message)
                    }
                  }
                  let resp = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/dir`+encodeURI(path))
                  let data = await resp.json()
                  changeFiles(data.files)
                  setLoadingState(false)
                  setMessage(`Successfully edited object name to "${newName.value}"!`)
                  changeEditing(editing.filter(i => i.path !== e.path))
                }
              }}>{editing.find(x => x.path == e.path) ? "Done" : "Edit"}</Button></td> : ""}
              <td>{e.isDir ? "-" : <svg onClick={() => window.location.href = `${process.env.NEXT_PUBLIC_URL}/api/bucket/file${encodeURI(e.url)}?download=true`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="20px"><path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>}</td>
              <td></td>
            </tr>)}
          </tbody>
        </Table>
      </div>
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
  let files = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/dir${encodeURI(req.url)}`, {
    headers: {
      "Cookie": `token=${req.cookies.token}`
    }
  })
  let data = []
  try {
    if(files.status !== 200) throw new Error()
    data = await files.json()
  } catch(e) {
    return {
      notFound: true
    }
  }
  return {
    props: {
      items: data.files,
      editable: data.editable,
      path: req.url,
      filePath: data.path,
      data: metadata,
      previousPaths: data.previousPaths,
      rootUser: metadata.user === "root"
    }
  }
}