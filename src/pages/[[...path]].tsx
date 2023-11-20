import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button, Container, Form, InputGroup, Table } from 'react-bootstrap'
import Swal from 'sweetalert2'
import withReactContent from 'sweetalert2-react-content'

export default function Home({ items, path, filePath, data, editable, previousPaths }: any) {
  let mySwal = withReactContent(Swal)
  let [metadata, changeMetaData] = useState(data)
  let [files, changeFiles] = useState(items)
  let [editing, changeEditing] = useState<any[]>([])
  let [message, setMessage] = useState("")
  let [deleting, setDeleting] = useState<any[]>([])
  let [loadingState, setLoadingState] = useState(false)
  let [editsDone, setEditsDone] = useState(true)
  let [edits, changeEdits] = useState<Array<{
    path: string,
    total: number,
    remaining: number,
    message: string,
    timeout: any,
    cancelable?: boolean
    errored?: boolean
  }>>([])

  useEffect(() => {
   (async () => {
    if(edits.length && editsDone)  setEditsDone(false)
    if(!edits.length && !editsDone) {
      setMessage("Tasks completed successfully.")
      let resp = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/dir`+encodeURI(path))
      let data = await resp.json()
      changeFiles(data.files)
      let resp2 = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/ping`)
      let data2 = await resp2.json()
      changeMetaData(data2)
      setEditsDone(true)
    }
   })()
  })

  useEffect(() => {
    if (message) {
      setTimeout(() => {
        setMessage("")
      }, 3000)
    }
  }, [message])
  return (
    <Container>
      <h6 style={{ textAlign: "center", marginTop: "60px" }}>{metadata.user ? `Logged in as: ${metadata.user}` : ""}</h6>
      <h2 style={{ textAlign: "center", marginTop: "30px" }}>{metadata.used} GB / {metadata.total} GB used ({(metadata.used / metadata.total*100).toFixed(5)}%)</h2>
      <h5 style={{ textAlign: "center", marginTop: "10px" }}>Extra money being used: ${metadata.used > metadata.total ? ((metadata.used - metadata.total)*0.02).toFixed(2) : 0.00}</h5>
      <h1 style={{ textAlign: "center", marginTop: "30px" }}>{filePath.split("/").slice(filePath == "/" ? 1 : 0).map((e: any, i: any, a: any) => { return {url: previousPaths[i], name: e || "/"}}).map((e:any) => <>{e.name !== "/" ? " => " : ""}<span style={{textDecoration: "underline"}} key={e.name} onClick={() => window.location.href = `${process.env.NEXT_PUBLIC_URL}${encodeURI(e.url)}`}>{decodeURIComponent(e.name)}</span></>)}</h1>
      <br></br>
      {deleting.length ? <h3 style={{ textAlign: "center" }}>Deleting {deleting.length} objects: <Button style={{ backgroundColor: "red" }} onClick={async () => {
        let listOfEdits: any[] = []
        setLoadingState(true)
        for (const object of deleting) {
          const obj: any = {
            path: "",
            remaining: 0,
            total: 0,
            message: "",
            timeout: "",
            cancelable: false
          }
          const replaceObj = async (o: Record<any, any>) => {
              listOfEdits.splice(listOfEdits.findIndex(x => x.path == o.path), 1, o)
              changeEdits([...listOfEdits])
          }
          setTimeout(async function item() {
            try {
              obj.path = object.path
              obj.timeout = item
              listOfEdits.push(obj)
              changeEdits([...listOfEdits])
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
                                  <h4 style={{textAlign: "center"}}>Warning: the following not fully written files will be affected: <br></br><br></br><ul>{json.affectedFiles.map((e:any) => <li key={e}>{e}</li>)}</ul><br></br> Do you want to overwrite?</h4>
                                  <br></br>
                                  <div>
                                    <Button style={{float: "left"}} onClick={async () => {
                                      mySwal.clickConfirm()
                                      let res = await fetch(`/api/bucket/${object.dir ? "dir" : 'file'}${encodeURI(object.path)}?overwrite=true`, {
                                        method: "DELETE"
                                      })
                                      if (!res.ok) {
                                        let data = await res.json()
                                        setLoadingState(false)
                                        obj.message = data.message
                                        replaceObj(obj)
                                        reject("DoNothing")
                                      }
                                      resolve("")
                                    }}>Yes</Button>
                                    <Button style={{float: "right", backgroundColor: "red"}} onClick={() => {
                                      mySwal.clickConfirm()
                                      setLoadingState(false)
                                      obj.message = json.message
                                      replaceObj(obj)
                                      reject("OverwriteRejected")
                                    }}>No</Button>
                                  </div>
                              </>
                          })
                          })
                          break;
                        default:
                          setLoadingState(false)
                          obj.message = json.message
                          obj.errored = true
                          replaceObj(obj)
                      }
              }
              listOfEdits.splice(listOfEdits.findIndex(x => x.path == object.path), 1)
              changeEdits([...listOfEdits])
              return "SUCCESS"
            } catch (e) {
              obj.errored = true
              switch(e) {
                case "DoNothing":
                  return replaceObj(obj)
                case "OverwriteRejected":
                  obj.message = "File overwrite has been rejected."
                  return replaceObj(obj)
                default:
                  obj.message = "Looks like an error has occured, please check the console."
              replaceObj(obj)
              setLoadingState(false)
              return console.error(e)
              }
            }
          }, 0)
        }
        setLoadingState(false)
        setDeleting([])
      }}>Delete</Button></h3> : editable ? <div style={{display: "grid", placeItems: "center"}}><InputGroup style={{width: "min(800px, 100%)"}}>
      <InputGroup.Text id="lu">Upload FIles</InputGroup.Text>
          <Form.Control required aria-describedby='lu' placeholder="Files..." id="files_to_upload" type="file" multiple></Form.Control>
      </InputGroup>
      <br></br>
                <Button type="button" onClick={() => {
                  let listOfEdits: any[] = []
                  let files: any = document.getElementById("files_to_upload")
                  if(!files.files.length) return  setMessage("Please set some files to upload!")
                  const read = (blob: Blob) => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (event: any) => resolve(new Uint8Array(event.target.result as any))
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(blob);
                  });
                  setLoadingState(true)
                  for (const file of files.files) {
                    const obj: any = {
                      path: `${filePath}${filePath == "/" ? "" : "/"}${file.name}`,
                      remaining: 0,
                      total: 0,
                      message: "",
                      timeout: ""
                    }
                    const replaceObj = async (o: Record<any, any>) => {
                        listOfEdits.splice(listOfEdits.findIndex(x => x.path == o.path), 1, o)
                        changeEdits([...listOfEdits])
                    }
                    setTimeout(async function time() {
                      try {
                        Object.assign(time, {key: ""})
                        let fileData: any = await read(file)
                        obj.total = Math.ceil(fileData.length / 8000000)
                        obj.timeout = time
                        listOfEdits.push(obj)
                        changeEdits(listOfEdits)
                        for(let i = 0; i < fileData.length; i += 8000000) {
                          let {key, cmd} = time as any
                          let array = Array.from(fileData.slice(i, i+8000000))
                          let res = await fetch(`/api/bucket/file${filePath}${filePath == "/" ? "" : "/"}${encodeURI(file.name)}`, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              "X-secret-token": key
                            },
                            body: JSON.stringify(array)
                          })
                          if(cmd == "STOPIT") {
                            let res = await fetch(`/api/bucket/file${filePath}${filePath == "/" ? "" : "/"}${encodeURI(file.name)}`, {
                              method: "POST",
                              headers: {
                                "Content-Type": "text/plain",
                                "X-secret-token": key
                              },
                              body: "CANCEL"
                            })
                            if (!res.ok) {
                              let data = await res.json()
                              obj.message = data.message
                              obj.errored = true
                              return replaceObj(obj)
                            }
                              obj.message = "Successfully cancelled upload!"
                              setTimeout(() => {
                                listOfEdits.splice(listOfEdits.findIndex(x => x.path == obj.path), 1)
                                changeEdits(listOfEdits)
                            }, 3000)
                              return replaceObj(obj)
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
                                        <h4 style={{textAlign: "center"}}>File at {filePath}{filePath == "/" ? "" : "/"}{file.name} is currently being written by another user. Do you want to overwrite?</h4>
                                        <br></br>
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
                                              obj.message = data.message
                                              await replaceObj(obj)
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
                                Object.assign(time, {key: (overwrite as any).key as string})
                                obj.remaining++
                                obj.total = Math.ceil(fileData.length / 8000000)
                                await replaceObj(obj)
                                continue;
                                case "OverwriteErr":
                                  let ow = await new Promise((resolve, reject) => {
                                    mySwal.fire({
                                      background: "#white",
                                      titleText: "Enter API Key",
                                      color: "#333333",
                                      confirmButtonColor: '#08c',
                                      html: <>
                                          <h4 style={{textAlign: "center"}}>Path {filePath}{filePath == "/" ? "" : "/"}{file.name} already exists. Do you want to overwrite?</h4>
                                          <br></br>
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
                                                obj.message = data.message
                                                await replaceObj(obj)
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
                                  Object.assign(time, {key: (ow as any).key as string})
                                  obj.remaining++
                                  obj.total = Math.ceil(fileData.length / 8000000)
                                  await replaceObj(obj)
                                  continue;
                              default:
                                setLoadingState(false)
                                obj.message = data.message
                                obj.errored = true
                                return await replaceObj(obj)
                            }
                          }
                          if(i == 0) {
                            let json = await res.json()
                            Object.assign(time, {key: json.key})
                          }
                          obj.remaining++
                          obj.total = Math.ceil(fileData.length / 8000000)
                          await replaceObj(obj)
                        }
                        let res = await fetch(`/api/bucket/file${filePath}${filePath == "/" ? "" : "/"}${encodeURI(file.name)}`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "text/plain",
                            "X-secret-token": (time as any).key
                          },
                          body: "END"
                        })
                        if (!res.ok) {
                          let data = await res.json()
                          setLoadingState(false)
                          obj.message = data.message
                          obj.errored = true
                          return replaceObj(obj)
                        }
                          let resp = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/dir`+encodeURI(path))
                          let data = await resp.json()
                          changeFiles(data.files)
                          let resp2 = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/ping`)
                          let data2 = await resp2.json()
                          changeMetaData(data2)
                          listOfEdits.splice(listOfEdits.findIndex(x => x.path == `${filePath}${filePath == "/" ? "" : "/"}${file.name}`), 1)
                          changeEdits([...listOfEdits])
                          return "SUCCESS"
                      } catch (e) {
                        obj.errored = true
                        switch(e) {
                          case "DoNothing":
                            return replaceObj(obj)
                          case "OverwriteRejected":
                            obj.message = "File overwrite has been rejected."
                            return replaceObj(obj)
                          default:
                            obj.message = "Looks like an error has occured, please check the console."
                            await replaceObj(obj)
                            return console.error(e)   
                        }
                      }
                    }, 0)
                  }
                  setLoadingState(false)
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
                    switch(json.type) {
                      case "OverwriteErr":
                        try {
                        await new Promise((resolve, reject) => {
                          mySwal.fire({
                            background: "#white",
                            titleText: "Enter API Key",
                            color: "#333333",
                            confirmButtonColor: '#08c',
                            html: <>
                                <h3 style={{textAlign: "center"}}>Path {filePath}{filePath == "/" ? "" : "/"}{folder.value} already exists. Do you want to overwrite?</h3>
                                <div>
                                  <Button style={{float: "left"}} onClick={async () => {
                                    mySwal.clickConfirm()
                                    let resp = await fetch(`/api/bucket/dir${filePath}${filePath == "/" ? "" : "/"}${encodeURI(folder.value)}?overwrite=true`, {
                                      method: "POST"
                                    })
                                    if (!resp.ok) {
                                      let data = await resp.json()
                                      setLoadingState(false)
                                      setMessage(data.message)
                                      reject()
                                    }
                                    resolve("")
                                  }}>Yes</Button>
                                  <Button style={{float: "right", backgroundColor: "red"}} onClick={() => {
                                    mySwal.clickConfirm()
                                    reject("OverwriteRejected")
                                  }}>No</Button>
                                </div>
                            </>
                        })
                        })
                      } catch(e) {
                        switch(e) {
                          case "OverwriteRejected":
                            setLoadingState(false)
                            return setMessage("Folder overwrite has been rejected.")
                          default:
                            return
                        }
                      }
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
                  setMessage(`Successfully added the folder "${folder.value}"!`)
                  folder.value = ""
                }}>Submit</Button>
      </div> : ""}
      <br></br>
      {edits.length ? <Table className="table">
        <thead>
                <tr>
                  <th>Path</th>
                  <th>Upload Progress</th>
                  <th>Message</th>
                  <th><Button style={{backgroundColor: "red"}} onClick={() => {
                    changeEdits(edits.filter(x => x.errored))
                    for(const {timeout} of edits.filter(x => x.cancelable != false)) {
                      (timeout as any).cmd = "STOPIT"
                    }
                  }}>Clear All</Button></th>
                </tr>
        </thead> 
        <tbody>
            {edits.map(e => <tr key={e.path}>
              <td>{e.path}</td>
              <td>{e.remaining} / {e.total} chunks</td>
              <td>{e.message}</td>
              <th><Button style={{backgroundColor: "red", display: `${e.cancelable != false ? "" : "none"}`}} onClick={() => {
                if(e.errored) changeEdits(edits.filter(x => e.path != x.path))
                if(e.cancelable != false) {(e.timeout as any).cmd = "STOPIT"}
              }}>Clear</Button></th>
            </tr>)}
        </tbody>
      </Table> : ""}
      <br></br>
      <h5 style={{textAlign: "center"}}>{message}</h5>
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
            {files.map((e: any) => <><tr key={e.path}>
              <td><input disabled={!editable} checked={!!deleting.find(x => x.path == e.path)} type="checkbox" onChange={(x) => {
                let value = x.target.checked
                if (value) {
                  setDeleting([...deleting, { dir: e.isDir, path: e.path }])
                } else {
                  setDeleting(deleting.filter(i => i.path !== e.path))
                }
              }}></input></td>
              <td><a href={`${process.env.NEXT_PUBLIC_URL}${e.isDir ? "" : "/api/bucket/file"}${encodeURI(e.url)}`}><img height={32} width={32} src={e.type ? `https://github.com/redbooth/free-file-icons/blob/master/32px/${e.mime == "application/octet-stream" ? "_blank" : e.type}.png?raw=true` : "https://img.icons8.com/ios-filled/50/folder-invoices--v2.png"} />{e.type ? "" : " "}{e.name}</a></td>
              <td>{e.mime || "-"}</td>
              <td>{e.isDir ? "-" : e.size}</td>
              <td>{e.modified}</td>
              {editable ? <td><Button onClick={async (x) => {
                if(x.currentTarget.innerText == "Edit") {
                  changeEditing([...editing, {path: e.path, value: e.name, newPath: e.path.split("/").slice(0, -1).join("/") || "/"}])
                } else {
                  let newName = editing.find(i => i.path == e.path)
                  if(newName.path == newName.newPath + (newName.newPath == "/" ? "" : "/") +  newName.value + `${e.isDir ? "" : `.${e.type}`}`) return changeEditing(editing.filter(i => i.path !== e.path));
                  if(!newName.value) return  setMessage("Please set a valid name to change the object to!!")
                  let {name} = files.find((i:any) => i.path == e.path)
                  setLoadingState(true)
                  let res = await fetch(`/api/bucket/dir${filePath}${filePath == "/" ? "" : "/"}${encodeURI(name)}${e.isDir ? "" : `.${e.type}`}`, {
                    method: "PATCH",
                    headers: {
                      'content-type': "application/json"
                    },
                    body: JSON.stringify({
                      newDir: `${newName.newPath}${newName.newPath == "/" ? "" : "/"}${newName.value}${e.isDir ? "" : `.${e.type}`}`
                    })
                  })
                  if(res.status !== 204) {
                    let json = await res.json()
                    switch(json.type) {
                      case "TransactionOverwriteErr":
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
                                        newDir: `${newName.newPath}${newName.newPath == "/" ? "" : "/"}${newName.value}${e.isDir ? "" : `.${e.type}`}`
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
                        case "GroupOverwriteErr":
                          await new Promise((resolve, reject) => {
                            mySwal.fire({
                              background: "#white",
                              color: "#333333",
                              confirmButtonColor: '#08c',
                              html: <>
                                  <h3 style={{textAlign: "center"}}>Path {newName.newPath}{newName.newPath == "/" ? "" : "/"}{newName.value}{e.isDir ? "" : `.${e.type}`} already exists. Do you want to overwrite?</h3>
                                  <div>
                                    <Button style={{float: "left"}} onClick={async () => {
                                      mySwal.clickConfirm()
                                      let res = await fetch(`/api/bucket/dir${filePath}${filePath == "/" ? "" : "/"}${encodeURI(name)}${e.isDir ? "" : `.${e.type}`}?overwriteGroup=true`, {
                                        method: "PATCH",
                                        headers: {
                                          "Content-Type": "application/json"
                                        },
                                        body:JSON.stringify({
                                          newDir: `${newName.newPath}${newName.newPath == "/" ? "" : "/"}${newName.value}${e.isDir ? "" : `.${e.type}`}`
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
                  setMessage(`Successfully edited object dir to "${newName.newPath}${newName.newPath == "/" ? "" : "/"}${newName.value}"!`)
                  changeEditing(editing.filter(i => i.path !== e.path))
                }
              }}>{editing.find(x => x.path == e.path) ? "Done" : "Edit"}</Button></td> : ""}
              <td>{e.isDir ? "-" : <svg onClick={() => window.location.href = `${process.env.NEXT_PUBLIC_URL}/api/bucket/file${encodeURI(e.url)}?download=true`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="20px"><path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>}</td>
              <td></td>
            </tr>
            <tr style={{height: "100px", display: `${editing.find(x => x.path == e.path) ? "" : "none"}`}}>
              <td style={{borderBottomWidth: 0}}></td>
              <td style={{borderBottomWidth: 0}}>
                <h6>Name:</h6>
                  <textarea key={e.name} defaultValue={e.name} placeholder='name...' onChange={(x) => {
                    let edit = editing.find(i => i.path === e.path)
                    changeEditing([...editing.filter(i => i.path !== e.path), {...edit, value: x.target.value}])
                  }}></textarea>
              </td>
              <td style={{borderBottomWidth: 0}}>
                <h6>Directory:</h6>
                  <textarea key={e.path} defaultValue={e.path.split("/").slice(0, -1).join("/") || "/"} placeholder='directory...' onChange={(x) => {
                    let edit = editing.find(i => i.path === e.path)
                    changeEditing([...editing.filter(i => i.path !== e.path), {...edit, newPath: x.target.value}])
                  }}></textarea>
              </td>
            </tr>
            </>)}
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