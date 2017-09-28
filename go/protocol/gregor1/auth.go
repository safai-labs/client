// Auto-generated by avdl-compiler v1.3.20 (https://github.com/keybase/node-avdl-compiler)
//   Input file: avdl/gregor1/auth.avdl

package gregor1

import (
	"github.com/keybase/go-framed-msgpack-rpc/rpc"
	context "golang.org/x/net/context"
)

type AuthResult struct {
	Uid      UID       `codec:"uid" json:"uid"`
	Username string    `codec:"username" json:"username"`
	Sid      SessionID `codec:"sid" json:"sid"`
	IsAdmin  bool      `codec:"isAdmin" json:"isAdmin"`
}

func (o AuthResult) DeepCopy() AuthResult {
	return AuthResult{
		Uid:      o.Uid.DeepCopy(),
		Username: o.Username,
		Sid:      o.Sid.DeepCopy(),
		IsAdmin:  o.IsAdmin,
	}
}

type AuthenticateSessionTokenArg struct {
	Session SessionToken `codec:"session" json:"session"`
}

func (o AuthenticateSessionTokenArg) DeepCopy() AuthenticateSessionTokenArg {
	return AuthenticateSessionTokenArg{
		Session: o.Session.DeepCopy(),
	}
}

type AuthInterface interface {
	AuthenticateSessionToken(context.Context, SessionToken) (AuthResult, error)
}

func AuthProtocol(i AuthInterface) rpc.Protocol {
	return rpc.Protocol{
		Name: "gregor.1.auth",
		Methods: map[string]rpc.ServeHandlerDescription{
			"authenticateSessionToken": {
				MakeArg: func() interface{} {
					ret := make([]AuthenticateSessionTokenArg, 1)
					return &ret
				},
				Handler: func(ctx context.Context, args interface{}) (ret interface{}, err error) {
					typedArgs, ok := args.(*[]AuthenticateSessionTokenArg)
					if !ok {
						err = rpc.NewTypeError((*[]AuthenticateSessionTokenArg)(nil), args)
						return
					}
					ret, err = i.AuthenticateSessionToken(ctx, (*typedArgs)[0].Session)
					return
				},
				MethodType: rpc.MethodCall,
			},
		},
	}
}

type AuthClient struct {
	Cli rpc.GenericClient
}

func (c AuthClient) AuthenticateSessionToken(ctx context.Context, session SessionToken) (res AuthResult, err error) {
	__arg := AuthenticateSessionTokenArg{Session: session}
	err = c.Cli.Call(ctx, "gregor.1.auth.authenticateSessionToken", []interface{}{__arg}, &res)
	return
}
