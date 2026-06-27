How do we convert a base 10 number to base62?
You repeatedly divide the number by 62 and record the remainders.

For example, convert 125:
125 ÷ 62 = 2 remainder 1
2 ÷ 62 = 0 remainder 2

Read the remainders from bottom to top:

2 1

So:
125₁₀ = 21₆₂

So the encoding algorithm becomes :-

function encode(num:number) : string {
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    if(num == 0) return "0";
    let result = "";
    while(num > 0){
        result = chars[num % 62] + result;
        num = Math.floor(num / 62);
    }
    return result;
}

function decode(shortCode:string) : number {
    let result = 0;
    for(let char of shortCode){
        let index = chars[char];
        result = (result * 62) + index;
    }
    return result;
}

The Anatomy of a Snowflake ID
It's a single 64-bit integer, but that one number is actually four smaller numbers squeezed together, each occupying a fixed set of bit positions:
SegmentBitsPurposeUnused (sign bit)1Kept as 0, so the number stays positiveTimestamp41Milliseconds since a custom starting point ("epoch")Worker/Machine ID10Identifies which server generated this IDSequence12A per-millisecond counter, in case the same machine generates multiple IDs within the same millisecond
[1 bit unused][41 bits timestamp][10 bits worker id][12 bits sequence]

