import { useEffect, useState } from 'react'
import { Button, Container, Form, InputGroup, Table } from 'react-bootstrap'
import Arrow from "@/components/icons/Arrow"
import Download from "@/components/icons/Download"
import Reload from "@/components/icons/Reload"
import Folder from "@/components/icons/Folder"
import Upload from "@/components/icons/Upload"
import FolderCreate from "@/components/icons/FolderCreate"
import Search from "@/components/icons/Search"
import Edit from "@/components/icons/Edit"
import Checkmark from "@/components/icons/Checkmark"
import Server from "@/components/icons/Server"
import XMark from "@/components/icons/X"
import Swal from 'sweetalert2'
import withReactContent from 'sweetalert2-react-content'

export default function Home({ items, path, filePath, data, editable, previousPaths }: any) {
  let mySwal = withReactContent(Swal)
  let [metadata, changeMetaData] = useState(data)
  let [originalFiles, changeOriginalFiles] = useState(items)
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
      setDeleting([])
      let resp = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/dir`+encodeURI(path))
      let data = await resp.json()
      changeFiles(data.files)
      changeOriginalFiles(data.files)
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
      <div style={{display: "grid", placeItems: "center"}}>
      <div className="scale" style={{backgroundColor: "lightblue", borderRadius: "15px", marginTop: "50px", width: "fit-content", padding: "20px", display: "grid", placeItems:"center"}}>
      <h6 style={{ textAlign: "center", marginTop: "10px"}}>{metadata.user ? `User: ${metadata.user.toUpperCase()}` : "User: NULL"}</h6>
      <h5 style={{ textAlign: "center", marginTop: "10px" }}>${5 + (metadata.used > metadata.total ? ((metadata.used - metadata.total)*0.02).toFixed(2) : 0.00 as any)} / month</h5>
      <h2 style={{ textAlign: "center", marginTop: "10px" }}>{metadata.used} GB / {metadata.total} GB used ({(metadata.used / metadata.total*100).toFixed(5)}%)</h2>
      <div style={{width: "70%", backgroundColor: "lightcyan", height: "24px", borderRadius: "24px"}}>
        <div style={{width: `${(metadata.used / metadata.total*100)}%`, backgroundColor: "silver", height: "24px", opacity: "80%", borderRadius: "24px"}}>

        </div>
      </div>
      </div>
      </div>
      <div style={{display: "grid", placeItems: "center"}}>
      <h1 style={{ textAlign: "center", marginTop: "30px", paddingBottom: "13px", paddingTop: "8px", paddingRight: "20px", paddingLeft: "20px", borderRadius: "10px", backgroundColor: "lightblue", width: "fit-content" }} className="scale">{filePath.split("/").slice(filePath == "/" ? 1 : 0).map((e: any, i: any, a: any) => { return {url: previousPaths[i], name: e || "/"}}).map((e:any) => <>{e.name !== "/" ? <>&nbsp;&nbsp;&nbsp;<Arrow></Arrow>&nbsp;&nbsp;&nbsp;</> : ""}<span className='clickabledir' key={e.name} onClick={() => window.location.href = `${process.env.NEXT_PUBLIC_URL}${encodeURI(e.url)}`}>{e.name == "/" ? <Server></Server> : decodeURIComponent(e.name)}</span></>)}</h1>
      </div>
      
      <div style={{display: "grid", placeItems: "center"}}>
      <div className="scale" style={{backgroundColor: "lightblue", borderRadius: "10px", marginTop: "25px", width: "fit-content", padding: "10px", display: "grid", placeItems:"center"}}>
        <h6 style={{ textAlign: "center", marginTop: "10px" }}>{files.filter((e:any) => e.isDir).length} folders, {files.filter((e:any) => !e.isDir).length} files</h6>
      </div>
      </div>
      <br></br>
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
              changeEdits([...edits.filter(x => x.cancelable != false), ...listOfEdits])
          }
          setTimeout(async function item() {
            try {
              obj.path = object.path
              obj.timeout = item
              listOfEdits.push(obj)
              changeEdits([...edits.filter(x => x.cancelable != false), ...listOfEdits])
              let res = await fetch(`/api/bucket/${object.dir ? "dir" : 'file'}${encodeURI(object.path)}`, {
                method: "DELETE"
              })
              if (!res.ok) {
                let json = await res.json()
                      switch(json.type) {
                        case "OverwriteErr":
                          await new Promise((resolve, reject) => {
                            setInterval(() => {
                              if(!mySwal.isVisible()) resolve("")
                            }, 100)
                          })
                          await new Promise((resolve, reject) => {
                            mySwal.fire({
                              background: "#white",
                              color: "#333333",
                              titleText: `Path ${object.path}`,
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
                                      setTimeout(() => {
                                        listOfEdits.splice(listOfEdits.findIndex(x => x.path == object.path), 1)
                                        changeEdits([...edits.filter(x => x.cancelable == false), ...listOfEdits])
                                    }, 3000)
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
                          return replaceObj(obj)
                      }
              }
              listOfEdits.splice(listOfEdits.findIndex(x => x.path == object.path), 1)
              changeEdits([...edits.filter(x => x.cancelable != false), ...listOfEdits])
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
      }}>Delete</Button></h3> : editable ? <div style={{display: "grid", placeItems: "center"}}><InputGroup style={{width: "min(800px, 100%)"}}>
      <InputGroup.Text><Upload></Upload></InputGroup.Text>
          <Form.Control required aria-describedby='lu' placeholder="Files..." id="files_to_upload" type="file" style={{width: "fit-content"}} multiple></Form.Control>
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
                        changeEdits([...edits.filter(x => x.cancelable == false), ...listOfEdits])
                    }
                    setTimeout(async function time() {
                      try {
                        Object.assign(time, {key: ""})
                        let fileData: any = await read(file)
                        obj.total = Math.ceil(fileData.length / 4000000)
                        obj.timeout = time
                        listOfEdits.push(obj)
                        changeEdits([...edits.filter(x => x.cancelable == false), ...listOfEdits])
                        for(let i = 0; i < fileData.length; i += 4000000) {
                          let {key, cmd} = time as any
                          let array = Array.from(fileData.slice(i, i+4000000))
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
                                changeEdits([...edits.filter(x => x.cancelable == false), ...listOfEdits])
                            }, 3000)
                              return replaceObj(obj)
                          }
                          if (!res.ok) {
                            let data = await res.json()
                            switch(data.type) {
                              case "InvalidTokenErr":
                                await new Promise((resolve, reject) => {
                                  setInterval(() => {
                                    if(!mySwal.isVisible()) resolve("")
                                  }, 100)
                                })
                                let overwrite = await new Promise((resolve, reject) => {
                                  mySwal.fire({
                                    background: "#white",
                                    titleText: `Path ${filePath}${filePath == "/" ? "" : "/"}${file.name}`,
                                    color: "#333333",
                                    confirmButtonColor: '#08c',
                                    html: <>
                                        <h4 style={{textAlign: "center"}}>This path is currently being written by another user. Do you want to overwrite?</h4>
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
                                            setTimeout(() => {
                                              listOfEdits.splice(listOfEdits.findIndex(x => x.path == `${filePath}${filePath == "/" ? "" : "/"}${file.name}`), 1)
                                              changeEdits([...edits.filter(x => x.cancelable == false), ...listOfEdits])
                                          }, 3000)
                                            reject("OverwriteRejected")
                                          }}>No</Button>
                                        </div>
                                    </>
                                })
                                })
                                Object.assign(time, {key: (overwrite as any).key as string})
                                obj.remaining++
                                obj.total = Math.ceil(fileData.length / 4000000)
                                await replaceObj(obj)
                                continue;
                                case "OverwriteErr":
                                  await new Promise((resolve, reject) => {
                                    setInterval(() => {
                                      if(!mySwal.isVisible()) resolve("")
                                    }, 100)
                                  })
                                  let ow = await new Promise((resolve, reject) => {
                                    mySwal.fire({
                                      background: "#white",
                                      titleText: `Path ${filePath}${filePath == "/" ? "" : "/"}${file.name}`,
                                      color: "#333333",
                                      confirmButtonColor: '#08c',
                                      html: <>
                                          <h4 style={{textAlign: "center"}}>This path already exists. Do you want to overwrite?</h4>
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
                                                obj.errored = true
                                                await replaceObj(obj)
                                                reject("DoNothing")
                                              }
                                              resolve(data)
                                            }}>Yes</Button>
                                            <Button style={{float: "right", backgroundColor: "red"}} onClick={() => {
                                              mySwal.clickConfirm()
                                              setTimeout(() => {
                                                  listOfEdits.splice(listOfEdits.findIndex(x => x.path == `${filePath}${filePath == "/" ? "" : "/"}${file.name}`), 1)
                                                  changeEdits([...edits.filter(x => x.cancelable == false), ...listOfEdits])
                                              }, 3000)
                                              reject("OverwriteRejected")
                                            }}>No</Button>
                                          </div>
                                      </>
                                  })
                                  }) 
                                  Object.assign(time, {key: (ow as any).key as string})
                                  obj.remaining++
                                  obj.total = Math.ceil(fileData.length / 4000000)
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
                          obj.total = Math.ceil(fileData.length / 4000000)
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
                          changeOriginalFiles(data.files)
                          let resp2 = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/ping`)
                          let data2 = await resp2.json()
                          changeMetaData(data2)
                          listOfEdits.splice(listOfEdits.findIndex(x => x.path == `${filePath}${filePath == "/" ? "" : "/"}${file.name}`), 1)
                          changeEdits([...edits.filter(x => x.cancelable == false), ...listOfEdits])
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
                }}>Upload Files</Button>
                <br></br>
                <InputGroup style={{width: "min(800px, 100%)"}}>
      <InputGroup.Text id="lu"><FolderCreate></FolderCreate></InputGroup.Text>
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
                  if(!res.ok) {
                    let json = await res.json()
                    switch(json.type) {
                      case "OverwriteErr":
                        try {
                          await new Promise((resolve, reject) => {
                            setInterval(() => {
                              if(!mySwal.isVisible()) resolve("")
                            }, 100)
                          })
                        await new Promise((resolve, reject) => {
                          mySwal.fire({
                            background: "#white",
                            titleText: `Path ${filePath}${filePath == "/" ? "" : "/"}${folder.value}`,
                            color: "#333333",
                            confirmButtonColor: '#08c',
                            html: <>
                                <h3 style={{textAlign: "center"}}>This path already exists. Do you want to overwrite?</h3>
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
                  changeOriginalFiles(data.files)
                  setLoadingState(false)
                  setMessage(`Successfully added the folder "${folder.value}"!`)
                  folder.value = ""
                }}>Add Folder</Button>
      </div> : ""}
      <br></br>
      {edits.length ? <Table className="table">
        <thead>
                <tr>
                  <th>Path</th>
                  <th>Upload Progress</th>
                  <th>Message</th>
                  <th><Button style={{backgroundColor: "red"}} onClick={() => {
                    changeEdits(edits.filter(x => !x.errored))
                    for(const edit of edits.filter(x => !x.errored && x.cancelable != false)) {
                      changeEdits([...edits.filter(x => x.path != edit.path), {...edit, message: "Cancelling upload..."}]);
                      (edit.timeout as any).cmd = "STOPIT"
                    }
                  }}><XMark></XMark></Button></th>
                  <th>{edits.length}</th>
                </tr>
        </thead> 
        <tbody>
            {edits.map(e => <tr key={e.path}>
              <td>{e.path}</td>
              <td><><div style={{width: "150px", backgroundColor: "lightskyblue", height: "24px", borderRadius: "24px"}}>
        <div style={{width: `${(e.remaining / e.total*100)}%`, backgroundColor: "blue", height: "24px", borderRadius: "24px"}}>

        </div>
      </div>
      <span style={{textAlign: "center", width: "150px", display: "inline-block"}}>{(e.remaining / e.total*100).toFixed(2)}%</span>
      </></td>
              <td>{e.message}</td>
              <td><Button style={{backgroundColor: "red", display: `${e.cancelable != false ? "" : "none"}`}} onClick={() => {
                if(edits.find(x => x.path == e.path)?.errored) return changeEdits([...edits.filter(x => e.path != x.path)])
                if(e.cancelable != false) {
                  changeEdits([...edits.filter(x => x.path != e.path), {...e, message: "Cancelling upload..."}]);
                  (e.timeout as any).cmd = "STOPIT"
                }
              }}><XMark></XMark></Button></td>
              <td></td>
            </tr>)}
        </tbody>
      </Table> : ""}
      <br></br>
      <h5 style={{textAlign: "center"}}>{message}</h5>
      <div style={{ marginTop: "100px", display: "grid", placeItems: "center" }}>
      <InputGroup style={{width: "min(800px, 100%)"}}>
      <InputGroup.Text id="lu"><Search></Search></InputGroup.Text>
          <Form.Control required aria-describedby='lu' placeholder="File Name..." type="text" onChange={(e) => {
            let {value} = e.target
            changeFiles([...originalFiles.filter((x:any) => x.name.toLowerCase().includes(value.toLowerCase()))])
          }}></Form.Control>
      </InputGroup>
      <br></br>
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
              {editable ? <th><Edit></Edit></th> : ""}
              <th><Download></Download></th>
              <th><Reload onClick={async () => {
                setLoadingState(true)
                let res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/dir`+encodeURI(path))
                let data = await res.json()
                changeFiles(data.files)
                changeOriginalFiles(data.files)
                let resp2 = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/bucket/ping`)
                let data2 = await resp2.json()
                changeMetaData(data2)
                setLoadingState(false)
              }}></Reload></th>
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
              <td><a href={`${process.env.NEXT_PUBLIC_URL}${e.isDir ? "" : "/api/bucket/file"}${encodeURI(e.url)}`}>{e.isDir ? <Folder></Folder> : <img height={32} width={32} src={`https://raw.githubusercontent.com/dmhendricks/file-icon-vectors/9b4b95928f7ff8d73bf45edf34862386e3c48ea5/dist/icons/vivid/${e.mime == "application/octet-stream" ? "bin" : e.type}.svg`} />}{e.name}</a></td>
              <td>{e.mime || "-"}</td>
              <td>{e.isDir ? "-" : e.size}</td>
              <td>{e.modified}</td>
              {editable ? <td><span className={editing.find(x => x.path == e.path) ?"Done" : "Edit"} onClick={async (x) => {
                if(x.currentTarget.className == "Edit") {
                  changeEditing([...editing, {path: e.path, value: e.name, newPath: e.path.split("/").slice(0, -1).join("/") || "/"}])
                } else {
                  let newName = editing.find(i => i.path == e.path)
                  if(newName.path == newName.newPath + (newName.newPath == "/" ? "" : "/") +  newName.value + `${e.isDir || !e.type ? "" : `.${e.type}`}`) return changeEditing(editing.filter(i => i.path !== e.path));
                  if(!newName.value) return  setMessage("Please set a valid name to change the object to!!")
                  let {name} = files.find((i:any) => i.path == e.path)
                  setLoadingState(true)
                  let res = await fetch(`/api/bucket/dir${filePath}${filePath == "/" ? "" : "/"}${encodeURI(name)}${e.isDir || !e.type  ? "" : `.${e.type}`}`, {
                    method: "PATCH",
                    headers: {
                      'content-type': "application/json"
                    },
                    body: JSON.stringify({
                      newDir: `${newName.newPath}${newName.newPath == "/" ? "" : "/"}${newName.value}${e.isDir || !e.type ? "" : `.${e.type}`}`
                    })
                  })
                  if(!res.ok) {
                    let json = await res.json()
                    switch(json.type) {
                      case "TransactionOverwriteErr":
                        await new Promise((resolve, reject) => {
                          setInterval(() => {
                            if(!mySwal.isVisible()) resolve("")
                          }, 100)
                        })
                        await new Promise((resolve, reject) => {
                          mySwal.fire({
                            background: "#white",
                            color: "#333333",
                            titleText: `Path ${filePath}${filePath == "/" ? "" : "/"}${name}${e.isDir || !e.type ? "" : `.${e.type}`}`,
                            confirmButtonColor: '#08c',
                            html: <>
                                <h3 style={{textAlign: "center"}}>Warning: the following not fully written files will be affected: <br></br><br></br><ul>{json.affectedFiles.map((e:any) => <li key={e}>{e}</li>)}</ul><br></br> Do you want to overwrite?</h3>
                                <br></br>
                                <div>
                                  <Button style={{float: "left"}} onClick={async () => {
                                    mySwal.clickConfirm()
                                    let res = await fetch(`/api/bucket/dir${filePath}${filePath == "/" ? "" : "/"}${encodeURI(name)}${e.isDir || !e.type ? "" : `.${e.type}`}?overwrite=true&overwriteGroup=true`, {
                                      method: "PATCH",
                                      headers: {
                                        "Content-Type": "application/json"
                                      },
                                      body:JSON.stringify({
                                        newDir: `${newName.newPath}${newName.newPath == "/" ? "" : "/"}${newName.value}${e.isDir || !e.type ? "" : `.${e.type}`}`
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
                            setInterval(() => {
                              if(!mySwal.isVisible()) resolve("")
                            }, 100)
                          })
                          await new Promise((resolve, reject) => {
                            mySwal.fire({
                              background: "#white",
                              color: "#333333",
                              titleText: `Path ${filePath}${filePath == "/" ? "" : "/"}${name}${e.isDir || !e.type ? "" : `.${e.type}`}`,
                              confirmButtonColor: '#08c',
                              html: <>
                                  <h4 style={{textAlign: "center"}}>Path {newName.newPath}{newName.newPath == "/" ? "" : "/"}{newName.value}{e.isDir || !e.type ? "" : `.${e.type}`} already exists. Do you want to overwrite?</h4>
                                  <br></br>
                                  <div>
                                    <Button style={{float: "left"}} onClick={async () => {
                                      mySwal.clickConfirm()
                                      let res = await fetch(`/api/bucket/dir${filePath}${filePath == "/" ? "" : "/"}${encodeURI(name)}${e.isDir || !e.type ? "" : `.${e.type}`}?overwriteGroup=true`, {
                                        method: "PATCH",
                                        headers: {
                                          "Content-Type": "application/json"
                                        },
                                        body:JSON.stringify({
                                          newDir: `${newName.newPath}${newName.newPath == "/" ? "" : "/"}${newName.value}${e.isDir || !e.type ? "" : `.${e.type}`}`
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
                  changeOriginalFiles(data.files)
                  setLoadingState(false)
                  setMessage(`Successfully edited object dir to "${newName.newPath}${newName.newPath == "/" ? "" : "/"}${newName.value}"!`)
                  changeEditing(editing.filter(i => i.path !== e.path))
                }
              }}>{editing.find(x => x.path == e.path) ? <Checkmark></Checkmark> : <Edit></Edit>}</span></td> : ""}
              <td>{e.isDir ? "-" : <Download onClick={() => window.location.href = `${process.env.NEXT_PUBLIC_URL}/api/bucket/file${encodeURI(e.url)}?download=true`}></Download>}</td>
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