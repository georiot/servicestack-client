/// <reference path="./dtos/test.interfaces.d.ts" />
//import 'cross-fetch/polyfill'

import * as dtos from "./dtos/techstacks.dtos"
import { 
    ResponseStatus, ResponseError,
    Authenticate,AuthenticateResponse,
    Hello, HelloResponse,
    HelloTypes,
    ReturnString, ReturnBytes, ReturnStream,
    TestAuth, TestAuthResponse,
    HelloReturnVoid,
    ThrowValidation, ThrowValidationResponse,
    EchoTypes,
    SendJson, SendText, SendRaw,
} from "./dtos/test.dtos"
import * as chai from "chai"
import {
    JsonServiceClient,
    ErrorResponse,
    appendQueryString, ApiRequest, ApiResponse,
} from '../src/index'
import {AppOverviewResponse} from "./dtos/techstacks.dtos";

declare var process:any

const { expect, assert } = chai

const TECHSTACKS_URL = "https://techstacks.io"
const TEST_URL = "https://test.servicestack.net"

//Clear existing User Session
const clearSession = async (client:JsonServiceClient) => {
    let logout = new Authenticate({ provider:"logout" })
    await client.post(logout)
}

describe ('JsonServiceClient Tests', () => {
    let client: JsonServiceClient
    let testClient: JsonServiceClient

    beforeEach(() => {
        client = new JsonServiceClient(TECHSTACKS_URL)
        testClient = new JsonServiceClient(TEST_URL)
    })

    it ('Should get techs response', async () => {
        const api = await client.api(new dtos.GetAllTechnologies())

        expect(api.response.results.length).to.be.greaterThan(0)
        expect(api.completed).eq(true)
        expect(api.succeeded).eq(true)
        expect(api.failed).eq(false)
    })

    it ('Can get multiple responses', async () => {
        let requests:ApiRequest[] = [
            new dtos.AppOverview(),
            new dtos.DeleteTechnology(), // requires auth
            new dtos.GetAllTechnologies(),
            new dtos.GetAllTechnologyStacks(),
        ]

        let results = await Promise.all(requests.map(async (request) =>
            ({ request, api:await client.api(request) as ApiResponse}) ))

        let failed = results.filter(x => x.api.failed)
        console.log(`${failed.length} failed`)
        failed.forEach(x =>
            console.log(`    ${x.request.getTypeName()} Request Failed: ${failed.map(x => x.api.errorMessage)}`))

        let succeeded = results.filter(x => x.api.succeeded)
        console.log(`\n${succeeded.length} succeeded: ${succeeded.map(x => x.request.getTypeName()).join(', ')}`)

        let r = succeeded.find(x => x.request.getTypeName() == 'AppOverview')?.api.response as AppOverviewResponse
        if (r) console.log(`Top 5 Technologies: ${r.topTechnologies.slice(0,4).map(tech => tech.name).join(', ')}`)
    })

    it('Should get techstacks overview', async () => {
        const api = await client.api(new dtos.Overview())

        expect(api.response.topTechnologies.length).to.be.greaterThan(0)
    })

    it('Should throw 405', async () => {
        const testClient = new JsonServiceClient(TEST_URL)
        const api = await testClient.api(new dtos.Overview())

        expect(api.errorCode).to.be.equal('NotImplementedException')
        expect(api.errorMessage).to.be.equal('The operation \'Overview\' does not exist for this service')
    })

    it('Should throw 401', async () => {
        const api = await client.api(new dtos.CreateTechnology())

        expect(api.errorCode).to.equal("401")
        expect(api.errorMessage).to.equal('Unauthorized')
    })

    it ('Should generate default value', () => {
        const request = new HelloTypes({ bool: false, int: 0 })
        const requestUrl = appendQueryString(TEST_URL, request)

        expect(requestUrl).to.equal(TEST_URL + "?bool=false&int=0")
    })

    it ('Should return raw text', async () => {

        const request = new ReturnString({ data: "0x10" })

        const str = await testClient.get(request)
        expect(str).eq("0x10")
    })

    // node-fetch v2 will implement arrayBuffer: https://github.com/bitinn/node-fetch/issues/51#issuecomment-253998195
    // it ('Should return raw bytes', done => {
    //     var request = new ReturnBytes()
    //     request.data = new Uint8Array([0x01])
    //     testClient.get(request)
    //         .then(r => {
    //             console.log('r',r)
    //             expect(r[0]).to.equal(0x01)
    //             done()
    //         }, done)
    // })

    it ('Can authenticate with HTTP Basic Auth', async () => {
        testClient.userName = "test"
        testClient.password = "test"

        const api = await testClient.api(new TestAuth())

        expect(api.response.userName).to.equal("test")
    })

    it ('Can authenticate with Credentials', async () => {

        await clearSession(testClient)

        const request = new Authenticate({
            provider: "credentials",
            userName: "test",
            password: "test",
            rememberMe: true
        })
        let authResponse = await testClient.post(request)

        expect(authResponse.userId).not.empty
        expect(authResponse.sessionId).not.empty

        //authenticated request
        const api = await testClient.api(new TestAuth())
        expect(api.response!.userName).to.equal("test")
    
        await clearSession(testClient)
    })

    it ('Can authenticate with BearerToken', async () => {
        const request = new Authenticate({
            provider: "credentials",
            userName: "test",
            password: "test",
        })
        let authApi = await testClient.api(request)
        expect(authApi.succeeded)
        const jwtToken = testClient.cookies['ss-tok'].value
        expect(jwtToken).not.empty

        //Clear existing User Session
        const logout = new Authenticate({ provider: "logout" })
        await testClient.api(logout)

        const newClient = new JsonServiceClient(TEST_URL)

        let api = await newClient.api(new Authenticate())

        expect(api.errorCode).to.equal("401")
        expect(api.errorMessage).to.equal("Unauthorized")

        //New Client with BearerToken
        newClient.bearerToken = jwtToken
        api = await newClient.api(new Authenticate())
        expect(api.response.userId).not.empty
        expect(api.response.sessionId).not.empty
    })
    
    it ('Should return 401 for failed HTTP Basic Auth requests', async () => {
        testClient.userName = "test"
        testClient.password = "wrong"

        testClient.exceptionFilter = (res,error) => {
            expect(error.responseStatus.errorCode).to.be.equal('Unauthorized')
            expect(error.responseStatus.message).to.be.equal('Invalid Username or Password')
        }

        const api = await testClient.api(new TestAuth())
        expect(api.errorCode).to.be.equal('Unauthorized')
        expect(api.errorMessage).to.be.equal('Invalid Username or Password')
    })

    it ('Should return 401 for failed Auth requests (vue-spa)', async () => {

        const client = new JsonServiceClient("https://vue-spa.web-templates.io")
        client.exceptionFilter = (res,error) => {
            expect(error.responseStatus.errorCode).to.be.equal('Unauthorized')
            expect(error.responseStatus.message).to.be.equal('Invalid Username or Password')
        }

        const api = await client.api(new Authenticate({
            provider: "credentials",
            userName: "test",
            password: "wrong",
        }))

        process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0

        expect(api.errorCode).to.be.equal('Unauthorized')
        expect(api.errorMessage).to.be.equal('Invalid Username or Password')

        process.env.NODE_TLS_REJECT_UNAUTHORIZED = 1
    })

    it ('Should return 401 for failed Auth requests (Test)', async () => {
        testClient.exceptionFilter = (res,error) => {
            expect(error.responseStatus.errorCode).to.be.equal('Unauthorized')
            expect(error.responseStatus.message).to.be.equal('Invalid Username or Password')
        }

        const api = await testClient.api(new Authenticate({
            provider: "credentials",
            userName: "test",
            password: "wrong",
        }))

        expect(api.errorCode).to.be.equal('Unauthorized')
        expect(api.errorMessage).to.be.equal('Invalid Username or Password')
    })

    it ('Can POST to EchoTypes', async () => {
        const request = new EchoTypes({ int:1, string:'foo'})

        const api = await testClient.api(request)

        expect(api.response.int).to.equal(request.int)
        expect(api.response.string).to.equal(request.string)
    })

    it ('Can GET IReturnVoid requests', async () => {
        let api = await testClient.apiVoid(new HelloReturnVoid({ id:1 }), 'GET')
        expect(api.completed).eq(true)
        expect(api.succeeded).eq(true)
        expect(api.failed).eq(false)
    })

    it ('Can POST IReturnVoid requests', async () => {
        let api = await testClient.apiVoid(new HelloReturnVoid({ id:1 }))
        expect(api.completed).eq(true)
        expect(api.succeeded).eq(true)
        expect(api.failed).eq(false)
    })

    it ('Can handle Validation Errors with Camel Casing', async () => {
        testClient.requestFilter = req => req.url += "?jsconfig=EmitCamelCaseNames:true"

        const api = await testClient.api(new ThrowValidation())

        expect(api.errorCode).to.be.equal("InclusiveBetween")
        expect(api.errorMessage).to.be.equal("'Age' must be between 1 and 120. You entered 0.")
        expect(api.errors.length).to.be.equal(3)
        expect(api.errors[1].errorCode).to.be.equal("NotEmpty")
        expect(api.errors[1].fieldName).to.be.equal("Required")
        expect(api.errors[1].message).to.be.equal("'Required' must not be empty.")
    })

    it ('Can handle Validation Errors with Pascal Casing', async () => {
        testClient.requestFilter = req => req.url += "?jsconfig=EmitCamelCaseNames:false"

        const api = await testClient.api(new ThrowValidation())

        expect(api.errorCode).to.be.equal("InclusiveBetween")
        expect(api.errorMessage).to.be.equal("'Age' must be between 1 and 120. You entered 0.")
        expect(api.errors.length).to.be.equal(3)
        expect(api.errors[1].errorCode).to.be.equal("NotEmpty")
        expect(api.errors[1].fieldName).to.be.equal("Required")
        expect(api.errors[1].message).to.be.equal("'Required' must not be empty.")
    })

    it ('Can GET using only path info', async () => {
        const r = await testClient.get<HelloResponse>("/hello/World")

        expect(r.result).to.equal("Hello, World!")
    })

    it ('Can GET using absolute url', async () => {

        const r = await testClient.get<HelloResponse>("https://test.servicestack.net/hello/World")
        expect(r.result).to.equal("Hello, World!")
    })

    it ('Can GET using route and queryString', async () => {
        const r = await testClient.get<HelloResponse>("/hello", { name: "World" })
        expect(r.result).to.equal("Hello, World!")
    })

    it ('Can GET EchoTypes using route and interface', async () => {
        const request:interfaces.EchoTypes = { int: 1, string: "foo" }

        const r = await testClient.get<EchoTypes>("/echo/types", request)
        expect(r.int).to.equal(request.int)
        expect(r.string).to.equal(request.string)
    })

    it ('Can query AutoQuery with runtime args', async () => {
        let request = new dtos.FindTechnologies({take: 3})
        let r = await client.api(request, { VendorName: "Amazon" })

        expect(r.response.results.length).to.equal(3)
        expect(r.response.results.map(x => x.vendorName)).to.have.members(["Amazon","Amazon","Amazon"])
    })

    it ('Can query AutoQuery with anon object and runtime args', async () => {
        let request = { Take: 3, VendorName: "Amazon" }
        
        let r = await client.get<dtos.QueryResponse<dtos.Technology>>("/technology/search", request)

        expect(r.results.length).to.equal(3)
        expect(r.results.map(x => x.vendorName)).to.have.members(["Amazon","Amazon","Amazon"])
    })

    it ('Can send raw JSON as object', async () => {
        let body = { foo: "bar" }

        let request = new SendJson({ id:1, name:"name" })

        const testClient = new JsonServiceClient(TEST_URL)
        if (typeof document == "undefined") //fetch in browser ignores custom headers
            testClient.responseFilter = res => expect(res.headers.get("X-Args")).to.eq("1,name")

        const json = await testClient.postBody(request, body)
        const obj = JSON.parse(json)
        expect(obj["foo"]).to.eq("bar")
    }) 

    it ('Can send raw JSON as string', async () => {
        let body = { foo: "bar" }

        let request = new SendJson({ id:1, name:"name"})

        const testClient = new JsonServiceClient(TEST_URL)
        if (typeof document == "undefined") //fetch in browser ignores custom headers
            testClient.responseFilter = res => expect(res.headers.get("X-Args")).to.eq("1,name")

        const json = await testClient.postBody(request, JSON.stringify(body))
        const obj = JSON.parse(json)
        expect(obj["foo"]).to.eq("bar")
    }) 

    it ('Can send raw string', async () => {
        let body = { foo: "bar" }

        let request = new SendText({ id:1, name:"name", contentType:"text/plain" })

        const testClient = new JsonServiceClient(TEST_URL)
        if (typeof document == "undefined") //fetch in browser ignores custom headers
            testClient.responseFilter = res => expect(res.headers.get("X-Args")).to.eq("1,name")

        const str = await testClient.postBody(request, "foo")
        expect(str).to.eq("foo")
    })

    it ('Can sendAll batch request', async () => {
        const requests = ["foo","bar","baz"].map(name => Object.assign(new Hello(), { name }))

        testClient.urlFilter = url => expect(url).eq(TEST_URL + "/json/reply/Hello[]")

        const responses = await testClient.sendAll(requests)

        expect(responses.map(x => x.result)).deep.equals(['Hello, foo!', 'Hello, bar!', 'Hello, baz!'])

        testClient.urlFilter = null
    })

    it ('Can sendAllOneWay IReturn<T> batch request', async () => {
        const requests = ["foo","bar","baz"].map(name => Object.assign(new Hello(), { name }))

        testClient.urlFilter = url => expect(url).eq(TEST_URL + "/json/oneway/Hello[]")

        const response = await testClient.sendAllOneWay(requests)

        expect(response).to.undefined

        testClient.urlFilter = null
    })

    it ('Can sendAllOneWay IReturnVoid batch request', async () => {
        const requests = ["foo","bar","baz"].map(name => Object.assign(new HelloReturnVoid(), { name }))

        testClient.urlFilter = url => expect(url).eq(TEST_URL + "/json/oneway/HelloReturnVoid[]")

        const response = await testClient.sendAllOneWay(requests)

        expect(response).to.undefined

        testClient.urlFilter = null
    })

    it ('Should change base path', () => {
        let client = new JsonServiceClient('https://example.org')
            .useBasePath('/api')
        expect(client.replyBaseUrl).to.eq('https://example.org/api/')
        expect(client.oneWayBaseUrl).to.eq('https://example.org/api/')

        client.useBasePath()
        expect(client.replyBaseUrl).to.eq('https://example.org/json/reply/')
        expect(client.oneWayBaseUrl).to.eq('https://example.org/json/oneway/')
    })

})