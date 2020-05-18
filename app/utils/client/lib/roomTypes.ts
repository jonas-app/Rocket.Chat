import { FlowRouter } from 'meteor/kadira:flow-router';
import _ from 'underscore';

import { IRoomTypes, RoomTypesCommon } from '../../lib/RoomTypesCommon';
import { hasAtLeastOnePermission } from '../../../authorization/client/hasPermission';
import { ChatRoom, ChatSubscription } from '../../../models/client';
import { IRoomTypeConfig } from '../../lib/RoomTypeConfig';
import { IUser } from '../../../../definition/IUser';

interface IRoomTypesClient extends IRoomTypes {
	archived(rid: string): boolean;
	getIdentifiers(e: string): string[];
	getNotSubscribedTpl(rid: string): string | undefined;
	getReadOnlyTpl(rid: string): string | undefined;
	getRoomName(roomType: string, roomData: any): string | undefined;
	getRoomType(roomId: string): string | undefined;
	getSecondaryRoomName(roomType: string, roomData: any): string | undefined;
	getTypes(): IRoomTypeConfig[];
	getUserStatus(roomType: string, roomId: string): string | undefined;
	getUserStatusText(roomType: string, roomId: string): string | undefined;
	readOnly(rid: string, user: IUser): boolean | undefined;
	verifyCanSendMessage(rid: string): boolean;
	verifyShowJoinLink(rid: string): boolean | undefined;
	openRouteLink(roomType: string, subData: any, queryParams: any): void;
	isAValidRoomTypeRoute(routeName: string): boolean;
	roomTypesBeforeStandard(): any[];
	roomTypesAfterStandard(): any[];
}

class RocketChatRoomTypes extends RoomTypesCommon implements IRoomTypesClient {
	protected roomTypes: Map<string, IRoomTypeConfig>;

	constructor() {
		super();
		this.roomTypes = new Map();
	}

	getTypes(): IRoomTypeConfig[] {
		return _.sortBy(this.roomTypesOrder, 'order')
			.map((type) => this.roomTypes.get(type.identifier) as IRoomTypeConfig)
			.filter((type) => !type.condition || type.condition());
	}

	getIcon(roomData: any): string | undefined {
		if (!roomData || !roomData.t || !this.roomTypes.get(roomData.t)) {
			return '';
		}
		return this.roomTypes.get(roomData.t)?.getIcon(roomData);
	}

	getRoomName(roomType: string, roomData: any): string | undefined {
		return this.roomTypes.get(roomType)?.roomName(roomData);
	}

	getSecondaryRoomName(roomType: string, roomData: any): string | undefined {
		return this.roomTypes.get(roomType)?.secondaryRoomName(roomData);
	}

	getIdentifiers(e: string): string[] {
		const initial: string[] = [];
		const except = initial.concat(e);
		const list = _.reject(this.roomTypesOrder, (t) => except.indexOf(t.identifier) !== -1);
		return _.map(list, (t) => t.identifier);
	}

	getUserStatus(roomType: string, rid: string): string | undefined {
		return this.roomTypes.get(roomType)?.getUserStatus(rid);
	}

	getRoomType(roomId: string): string | undefined {
		const fields = {
			t: 1,
		};
		const room = ChatRoom.findOne({
			_id: roomId,
		}, {
			fields,
		});
		return room && room.t;
	}

	getUserStatusText(roomType: string, rid: string): string | undefined {
		return this.roomTypes.get(roomType)?.getUserStatusText(rid);
	}

	findRoom(roomType: string, identifier: string): any {
		return this.roomTypes.get(roomType)?.findRoom(identifier);
	}

	canSendMessage(rid: string): boolean {
		return ChatSubscription.find({ rid }).count() > 0;
	}

	readOnly(rid: string, user: IUser): boolean | undefined {
		const fields: any = {
			ro: 1,
			t: 1,
		};
		if (user) {
			fields.muted = 1;
			fields.unmuted = 1;
		}
		const room = ChatRoom.findOne({
			_id: rid,
		}, {
			fields,
		});

		const roomType = room && room.t;
		if (roomType && this.roomTypes.get(roomType)?.readOnly) {
			return this.roomTypes.get(roomType)?.readOnly?.(rid, user);
		}

		if (!user) {
			return room && room.ro;
		}

		if (room) {
			if (Array.isArray(room.muted) && room.muted.indexOf(user.username) !== -1) {
				return true;
			}

			if (room.ro === true) {
				if (Array.isArray(room.unmuted) && room.unmuted.indexOf(user.username) !== -1) {
					return false;
				}

				if (hasAtLeastOnePermission('post-readonly', room._id)) {
					return false;
				}

				return true;
			}
		}

		return false;
	}

	archived(rid: string): boolean {
		const room = ChatRoom.findOne({ _id: rid }, { fields: { archived: 1 } });
		return room && room.archived === true;
	}

	verifyCanSendMessage(rid: string): boolean {
		const room = ChatRoom.findOne({ _id: rid }, { fields: { t: 1 } });
		if (!room || !room.t) {
			return false;
		}

		const roomType = room.t;
		return Boolean(this.roomTypes.get(roomType)?.canSendMessage(rid));
	}

	verifyShowJoinLink(rid: string): boolean | undefined {
		const room = ChatRoom.findOne({ _id: rid, t: { $exists: true, $ne: null } }, { fields: { t: 1 } });
		if (!room || !room.t) {
			return false;
		}
		const roomType = room.t;
		return this.roomTypes.get(roomType)?.showJoinLink(rid);
	}

	getNotSubscribedTpl(rid: string): string | undefined {
		const room = ChatRoom.findOne({ _id: rid, t: { $exists: true, $ne: null } }, { fields: { t: 1 } });
		if (!room || !room.t) {
			return '';
		}
		const roomType = room.t;
		return this.roomTypes.get(roomType)?.notSubscribedTpl;
	}

	getReadOnlyTpl(rid: string): string | undefined {
		const room = ChatRoom.findOne({ _id: rid, t: { $exists: true, $ne: null } }, { fields: { t: 1 } });
		if (!room || !room.t) {
			return '';
		}
		const roomType = room.t;
		return this.roomTypes.get(roomType)?.readOnlyTpl;
	}

	isAValidRoomTypeRoute(routeName: string): boolean {
		return Array.from(this.roomTypes.values())
			.map(({ route }) => route && route.name)
			.filter(Boolean)
			.includes(routeName);
	}

	openRouteLink(roomType: string, subData: any, queryParams: any): void {
		if (!this.roomTypes.has(roomType)) {
			return;
		}

		let routeData: { [key: string]: string } | undefined = {};
		if (this.roomTypes.get(roomType) && this.roomTypes.get(roomType)?.route && this.roomTypes.get(roomType)?.route?.link) {
			routeData = this.roomTypes.get(roomType)?.route?.link?.(subData);
		} else if (subData && subData.name) {
			routeData = {
				name: subData.name,
			};
		}

		return FlowRouter.go(this.roomTypes.get(roomType)?.route?.name, routeData, queryParams);
	}

	roomTypesBeforeStandard(): any[] {
		const orderLow = this.roomTypesOrder.filter((roomTypeOrder) => roomTypeOrder.identifier === 'c')[0].order;
		return this.roomTypesOrder
			.filter((roomTypeOrder) => roomTypeOrder.order < orderLow)
			.map((roomTypeOrder) => this.getConfig(roomTypeOrder.identifier))
			.filter((roomType) => roomType?.creationTemplate);
	}

	roomTypesAfterStandard(): any[] {
		const orderHigh = this.roomTypesOrder.filter((roomTypeOrder) => roomTypeOrder.identifier === 'd')[0].order;
		return this.roomTypesOrder
			.filter((roomTypeOrder) => roomTypeOrder.order > orderHigh)
			.map((roomTypeOrder) => this.getConfig(roomTypeOrder.identifier))
			.filter((roomType) => roomType?.creationTemplate);
	}
}

export const roomTypes: IRoomTypesClient = new RocketChatRoomTypes();
