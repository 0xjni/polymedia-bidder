module auction::user;

// === imports ===

use std::string::{utf8};
use sui::display::{Self};
use sui::package::{Self};
use sui::table_vec::{Self, TableVec};
use sui::table::{Self, Table};

use auction::paginator;

// === errors ===

const E_USER_ALREADY_EXISTS: u64 = 6000;

// === structs ===

/// one time witness (OTW)
public struct USER has drop {}

/// guarantees 1 User per address
public struct UserRegistry has key {
    id: UID,
    // address -> User
    users: Table<address, address>,
}

/// stores all auctions created and all bids placed by an address
public struct User has key {
    id: UID,
    created: TableVec<address>,
    bids: TableVec<UserBid>,
}

/// a bid on an auction
public struct UserBid has store, copy {
    auction_id: address,
    time: u64,
    amount: u64,
}

// === public-view functions ===

public fun get_created_page(
    user: &User,
    ascending: bool,
    cursor: u64,
    limit: u64,
): (vector<address>, bool, u64)
{
    return paginator::get_page(&user.created, ascending, cursor, limit)
}

public fun get_bids_page(
    user: &User,
    ascending: bool,
    cursor: u64,
    limit: u64,
): (vector<UserBid>, bool, u64)
{
    return paginator::get_page(&user.bids, ascending, cursor, limit)
}

// === public accessors ===

public fun users(
    registry: &UserRegistry,
): &Table<address, address> {
    &registry.users
}

public fun created(
    user: &User,
): &TableVec<address> {
    &user.created
}

public fun bids(
    user: &User,
): &TableVec<UserBid> {
    &user.bids
}

// === UserRequest hot potato ===

public struct UserRequest {
    user: User,
}

public fun new_user_request(
    registry: &mut UserRegistry,
    ctx: &mut TxContext,
): UserRequest
{
    assert!( !registry.users.contains(ctx.sender()), E_USER_ALREADY_EXISTS );
    let user = new_user(ctx);
    registry.users.add(ctx.sender(), user.id.to_address());
    return UserRequest { user }
}

public fun existing_user_request(
    user: User,
): UserRequest {
    return UserRequest {
        user,
    }
}

public(package) fun borrow_mut_user(
    request: &mut UserRequest,
): &mut User {
    return &mut request.user
}

public fun destroy_user_request(
    request: UserRequest,
    ctx: &TxContext,
) {
    let UserRequest { user } = request;
    user.transfer_to_sender(ctx);
}

// === public-package functions ===

public(package) fun add_created(
    user: &mut User,
    auction_addr: address,
) {
    user.created.push_back(auction_addr);
}

public(package) fun add_bid(
    user: &mut User,
    bid: UserBid,
) {
    user.bids.push_back(bid);
}

public(package) fun new_bid(
    auction_addr: address,
    time: u64,
    amount: u64,
): UserBid {
    return UserBid {
        auction_id: auction_addr,
        time,
        amount,
    }
}

// === private functions ===

fun new_registry(ctx: &mut TxContext): UserRegistry {
    return UserRegistry {
        id: object::new(ctx),
        users: table::new(ctx),
    }
}

fun new_user(
    ctx: &mut TxContext,
): User
{
    return User {
        id: object::new(ctx),
        created: table_vec::empty(ctx),
        bids: table_vec::empty(ctx),
    }
}

fun transfer_to_sender(
    user: User,
    ctx: &TxContext,
) {
    transfer::transfer(user, ctx.sender());
}

// === initialization ===

#[allow(lint(share_owned))]
fun init(otw: USER, ctx: &mut TxContext)
{
    // claim Publisher object

    let publisher = package::claim(otw, ctx);

    // create and share the only UserRegistry object that will ever exist

    let registry = new_registry(ctx);
    transfer::share_object(registry);

    // Display for UserRegistry

    let mut display_reg = display::new<UserRegistry>(&publisher, ctx);
    display_reg.add(utf8(b"name"), utf8(b"Auction User UserRegistry"));
    display_reg.add(utf8(b"description"), utf8(b"All auction creators and bidders."));
    display_reg.add(utf8(b"link"), utf8(b"https://auction.polymedia.app"));
    display_reg.add(utf8(b"image_url"), utf8(b"data:image/svg+xml,%3Csvg%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%201000%201000%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23002436%22%2F%3E%3CforeignObject%20width%3D%22100%25%22%20height%3D%22100%25%22%3E%3Cdiv%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxhtml%22%20style%3D%22%20height%3A100%25%3Bwidth%3A100%25%3Bdisplay%3Aflex%3Bflex-direction%3Acolumn%3Bjustify-content%3Acenter%3Balign-items%3Acenter%3Bgap%3A1em%3Bbox-sizing%3Aborder-box%3Bpadding%3A0.66em%3Bfont-size%3A100px%3Bfont-family%3Asystem-ui%3Bcolor%3Awhite%3Btext-align%3Acenter%3Boverflow-wrap%3Aanywhere%3B%22%3E%3Cdiv%20style%3D%22font-size%3A1.5em%22%3E%3Cb%3EAUCTION%20USER%20REGISTRY%3C%2Fb%3E%3C%2Fdiv%3E%3C%2Fdiv%3E%3C%2FforeignObject%3E%3C%2Fsvg%3E"));
    display_reg.add(utf8(b"project_name"), utf8(b"Auction | Polymedia"));
    display_reg.add(utf8(b"project_url"), utf8(b"https://auction.polymedia.app"));
    // display_reg.add(utf8(b"thumbnail_url"), utf8(b""));
    // display_reg.add(utf8(b"project_image_url"), utf8(b""));
    // display_reg.add(utf8(b"creator"), utf8(b""));
    display::update_version(&mut display_reg);

    // Display for User

    let mut display_usr = display::new<User>(&publisher, ctx);
    display_usr.add(utf8(b"name"), utf8(b"Auction User"));
    display_usr.add(utf8(b"description"), utf8(b"User auctions and bids."));
    display_usr.add(utf8(b"link"), utf8(b"https://auction.polymedia.app"));
    display_usr.add(utf8(b"image_url"), utf8(b"data:image/svg+xml,%3Csvg%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%201000%201000%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23002436%22%2F%3E%3CforeignObject%20width%3D%22100%25%22%20height%3D%22100%25%22%3E%3Cdiv%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxhtml%22%20style%3D%22%20height%3A100%25%3Bwidth%3A100%25%3Bdisplay%3Aflex%3Bflex-direction%3Acolumn%3Bjustify-content%3Acenter%3Balign-items%3Acenter%3Bgap%3A1em%3Bbox-sizing%3Aborder-box%3Bpadding%3A0.66em%3Bfont-size%3A100px%3Bfont-family%3Asystem-ui%3Bcolor%3Awhite%3Btext-align%3Acenter%3Boverflow-wrap%3Aanywhere%3B%22%3E%3Cdiv%20style%3D%22font-size%3A1.5em%22%3E%3Cb%3EAUCTION%20USER%3C%2Fb%3E%3C%2Fdiv%3E%3C%2Fdiv%3E%3C%2FforeignObject%3E%3C%2Fsvg%3E"));
    display_usr.add(utf8(b"project_name"), utf8(b"Auction | Polymedia"));
    display_usr.add(utf8(b"project_url"), utf8(b"https://auction.polymedia.app"));
    // display_usr.add(utf8(b"thumbnail_url"), utf8(b""));
    // display_usr.add(utf8(b"project_image_url"), utf8(b""));
    // display_usr.add(utf8(b"creator"), utf8(b""));
    display::update_version(&mut display_usr);

    // transfer objects to the sender

    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(display_reg, ctx.sender());
    transfer::public_transfer(display_usr, ctx.sender());
}

// === test functions ===

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(USER {}, ctx)
}

#[test_only]
public fun new_registry_for_testing(ctx: &mut TxContext): UserRegistry {
    return new_registry(ctx)
}