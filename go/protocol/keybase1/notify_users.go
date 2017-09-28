// Auto-generated by avdl-compiler v1.3.20 (https://github.com/keybase/node-avdl-compiler)
//   Input file: avdl/keybase1/notify_users.avdl

package keybase1

import (
	"github.com/keybase/go-framed-msgpack-rpc/rpc"
	context "golang.org/x/net/context"
)

type UserChangedArg struct {
	Uid UID `codec:"uid" json:"uid"`
}

func (o UserChangedArg) DeepCopy() UserChangedArg {
	return UserChangedArg{
		Uid: o.Uid.DeepCopy(),
	}
}

type NotifyUsersInterface interface {
	UserChanged(context.Context, UID) error
}

func NotifyUsersProtocol(i NotifyUsersInterface) rpc.Protocol {
	return rpc.Protocol{
		Name: "keybase.1.NotifyUsers",
		Methods: map[string]rpc.ServeHandlerDescription{
			"userChanged": {
				MakeArg: func() interface{} {
					ret := make([]UserChangedArg, 1)
					return &ret
				},
				Handler: func(ctx context.Context, args interface{}) (ret interface{}, err error) {
					typedArgs, ok := args.(*[]UserChangedArg)
					if !ok {
						err = rpc.NewTypeError((*[]UserChangedArg)(nil), args)
						return
					}
					err = i.UserChanged(ctx, (*typedArgs)[0].Uid)
					return
				},
				MethodType: rpc.MethodNotify,
			},
		},
	}
}

type NotifyUsersClient struct {
	Cli rpc.GenericClient
}

func (c NotifyUsersClient) UserChanged(ctx context.Context, uid UID) (err error) {
	__arg := UserChangedArg{Uid: uid}
	err = c.Cli.Notify(ctx, "keybase.1.NotifyUsers.userChanged", []interface{}{__arg})
	return
}
