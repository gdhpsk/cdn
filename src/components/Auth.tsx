import React, { useEffect, useState } from 'react'
import { Row, Col, Accordion, Button, Nav, InputGroup, Form } from 'react-bootstrap'
import Swal from 'sweetalert2'
import styles from "@/styles/Leaderboard.module.css"
import withReactContent from 'sweetalert2-react-content'

const Auth: React.FC = () => {
    let mySwal = withReactContent(Swal)
    function display() { 
    mySwal.fire({
        background: "#white",
        titleText: "Enter API Key",
        color: "#333333",
        confirmButtonColor: '#08c',
        html: <>
            <div id="login">
                <Form>
                <InputGroup>
                <InputGroup.Text id="lu">Email</InputGroup.Text>
                    <Form.Control required aria-describedby='lu' placeholder="API Key..." id="log_email" type="text"></Form.Control>
                </InputGroup>
                <br></br>
                <Button type="button" onClick={() => {
                    document.cookie = `token=${(document.getElementById("log_email") as any).value}`
                    window.location.reload()
                }}>Submit</Button>
                </Form>
            </div>
        </>
    })
}
    return <Nav.Link onClick={display} style={{color: "white"}}>Key</Nav.Link>
}

export default Auth